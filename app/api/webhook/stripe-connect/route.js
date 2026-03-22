import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { classifyDecline } from '@/libs/die';
import { computeRetryDate } from '@/libs/paydayRetry';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';

// ShipFast Stripe client — used ONLY to verify the webhook signature
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * POST /api/webhook/stripe-connect
 *
 * Receives events from ALL connected client Stripe accounts.
 * Separate from /api/webhook/stripe (ShipFast billing — DO NOT TOUCH).
 * Uses STRIPE_CONNECT_WEBHOOK_SECRET for signature verification.
 */
export async function POST(request) {
  const body = await request.text();
  const sig = request.headers.get('stripe-signature');

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('[webhook/stripe-connect] Signature verification failed:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Identifies which client Stripe account sent this event
  const stripeAccountId = event.account;

  if (!stripeAccountId) {
    console.error('[webhook/stripe-connect] Missing event.account — not a Connect event');
    return NextResponse.json({ error: 'Not a Connect event' }, { status: 400 });
  }

  try {
    await connectMongo();

    // Find the REVENANT user who owns this connected account
    const connection = await StripeConnection.findOne({ stripeAccountId });

    if (!connection) {
      // Connected account exists in Stripe but not in our DB (e.g. disconnected)
      console.warn('[webhook/stripe-connect] Unknown stripeAccountId:', stripeAccountId);
      return NextResponse.json({ received: true }); // acknowledge to Stripe
    }

    const orgId = connection.userId;

    switch (event.type) {

      // ── invoice.payment_failed ──────────────────────────────────────────────
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event.data.object, orgId, stripeAccountId);
        break;
      }

      // ── invoice.payment_succeeded ───────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(event.data.object, orgId);
        break;
      }

      // ── customer.subscription.updated ──────────────────────────────────────
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object, orgId, stripeAccountId);
        break;
      }

      // ── payment_method.updated ──────────────────────────────────────────────
      case 'payment_method.updated': {
        await handlePaymentMethodUpdated(event.data.object, orgId);
        break;
      }

      default:
        // Acknowledge unhandled events silently
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[webhook/stripe-connect]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

// ── Event handlers ────────────────────────────────────────────────────────────

async function handleInvoicePaymentFailed(inv, orgId, stripeAccountId) {
  const failureCode = inv.last_payment_error?.code ?? null;
  const dieCategory = classifyDecline(failureCode);

  const failedAt = inv.status_transitions?.past_due_at
    ? new Date(inv.status_transitions.past_due_at * 1000)
    : new Date();

  // Compute retry date only for SOFT_TEMPORARY — SOFT_UPDATABLE requires card update
  let nextRetryAt = null;
  let nextRetrySource = 'default';

  if (dieCategory === 'SOFT_TEMPORARY') {
    // Attempt to get card country from associated subscription
    const sub = await Subscription.findOne({
      stripeSubscriptionId: inv.subscription,
      orgId,
    });

    const retryResult = computeRetryDate({
      failedAt,
      inferredPaydayCycle: sub?.inferredPaydayCycle ?? null,
      customerCountry: sub?.cardCountry ?? null,
    });

    nextRetryAt = retryResult.retryAt;
    nextRetrySource = retryResult.source;
  }

  await Invoice.findOneAndUpdate(
    { stripeInvoiceId: inv.id },
    {
      orgId,
      stripeAccountId,
      stripeInvoiceId: inv.id,
      stripeSubscriptionId: inv.subscription ?? null,
      stripeCustomerId: inv.customer,
      customerEmail: inv.customer_email ?? null,
      customerName: inv.customer_name ?? null,
      amount: inv.amount_due,
      currency: inv.currency ?? 'usd',
      status: 'open',
      dieCategory,
      failureCode,
      failureMessage: inv.last_payment_error?.message ?? null,
      failedAt,
      nextRetryAt,
      nextRetrySource,
    },
    { upsert: true, new: true }
  );
}

async function handleInvoicePaymentSucceeded(inv, orgId) {
  await Invoice.findOneAndUpdate(
    { stripeInvoiceId: inv.id, orgId },
    {
      status: 'recovered',
      recoveredAt: new Date(),
      nextRetryAt: null,
    }
  );
}

async function handleSubscriptionUpdated(sub, orgId, stripeAccountId) {
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id, orgId },
    {
      orgId,
      stripeAccountId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
      status: sub.status,
      planId: sub.items?.data?.[0]?.price?.id ?? null,
      currentPeriodStart: sub.current_period_start
        ? new Date(sub.current_period_start * 1000)
        : null,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
    },
    { upsert: true, new: true }
  );
}

async function handlePaymentMethodUpdated(pm, orgId) {
  // Update card metadata on all subscriptions using this payment method
  await Subscription.updateMany(
    { paymentMethodId: pm.id, orgId },
    {
      cardBrand: pm.card?.brand ?? null,
      cardLast4: pm.card?.last4 ?? null,
      cardExpMonth: pm.card?.exp_month ?? null,
      cardExpYear: pm.card?.exp_year ?? null,
      cardCountry: pm.card?.country ?? null,
    }
  );
}

import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { classifyDecline } from '@/libs/die';
import { computeRetryDate } from '@/libs/paydayRetry';
import { computeRecoveryScore } from '@/libs/recoveryScore';
import { computeHealthScore } from '@/libs/healthScore';
import { computeMRR } from '@/libs/stripeConnect';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';
import DunningSequence from '@/models/DunningSequence';

// Required: prevents Next.js from caching or pre-processing this route.
// Stripe signature verification requires the raw, unmodified request body.
export const dynamic = 'force-dynamic';

// Dunning email delays in days, indexed by DIE category
const SEQUENCE_DELAYS_DAYS = {
  SOFT_TEMPORARY: [0, 3, 7, 14, 21], // 5 emails
  SOFT_UPDATABLE: [0, 3, 7, 14],     // 4 emails
};

/**
 * POST /api/webhook/stripe-connect
 *
 * Receives events from ALL connected client Stripe accounts.
 * Separate from /api/webhook/stripe (ShipFast billing — DO NOT TOUCH).
 * Uses STRIPE_CONNECT_WEBHOOK_SECRET for signature verification.
 */
export async function POST(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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
    // Log enough context to diagnose wrong-secret vs body-corruption without
    // leaking the full secret value.
    console.error('[REVENANT:WEBHOOK] ❌ Signature verification failed', {
      error: err.message,
      signatureHeader: sig ? sig.substring(0, 24) + '...' : 'MISSING',
      secretDefined: !!process.env.STRIPE_CONNECT_WEBHOOK_SECRET,
      // First 12 chars — enough to tell CLI secret (whsec_...) from prod secret
      secretPrefix: process.env.STRIPE_CONNECT_WEBHOOK_SECRET?.substring(0, 12) ?? 'undefined',
      bodyLength: body?.length ?? 0,
    });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Identifies which client Stripe account sent this event
  const stripeAccountId = event.account;

  if (!stripeAccountId) {
    console.error('[REVENANT:WEBHOOK] ❌ Missing event.account — not a Connect event', {
      eventId: event.id,
      type: event.type,
    });
    return NextResponse.json({ error: 'Not a Connect event' }, { status: 400 });
  }

  console.log('[REVENANT:WEBHOOK] Event received', {
    type: event.type,
    id: event.id,
    account: stripeAccountId,
    timestamp: new Date().toISOString(),
  });

  try {
    await connectMongo();

    // Find the REVENANT user who owns this connected account
    const connection = await StripeConnection.findOne({ stripeAccountId });

    if (!connection) {
      console.warn('[REVENANT:WEBHOOK] ⚠ Unknown stripeAccountId — no matching StripeConnection', {
        stripeAccountId,
        eventId: event.id,
      });
      return NextResponse.json({ received: true });
    }

    const orgId = connection.userId;

    switch (event.type) {

      // ── invoice.payment_failed ──────────────────────────────────────────────
      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event.data.object, orgId, stripeAccountId);
        await refreshHealthScore(orgId);
        break;
      }

      // ── invoice.payment_succeeded ───────────────────────────────────────────
      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(event.data.object, orgId);
        await refreshHealthScore(orgId);
        break;
      }

      // ── customer.subscription.updated ──────────────────────────────────────
      case 'customer.subscription.updated': {
        await handleSubscriptionUpdated(event.data.object, orgId, stripeAccountId);
        await refreshHealthScore(orgId);
        break;
      }

      // ── invoice.created ────────────────────────────────────────────────────────
      case 'invoice.created': {
        const inv = event.data.object;
        await Invoice.findOneAndUpdate(
          { stripeInvoiceId: inv.id },
          {
            orgId,
            stripeAccountId,
            stripeInvoiceId: inv.id,
            stripeCustomerId: inv.customer,
            stripeSubscriptionId: inv.subscription ?? null,
            amount: inv.amount_due,
            currency: inv.currency ?? 'usd',
            status: inv.status,
            customerEmail: inv.customer_email ?? null,
            customerName: inv.customer_name ?? null,
          },
          { upsert: true, new: true }
        );
        break;
      }

      // ── customer.subscription.deleted ──────────────────────────────────────────
      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object, orgId);
        await refreshHealthScore(orgId);
        break;
      }

      // ── payment_method.updated ──────────────────────────────────────────────
      case 'payment_method.updated': {
        await handlePaymentMethodUpdated(event.data.object, orgId);
        await refreshHealthScore(orgId);
        break;
      }

      default:
        console.log('[REVENANT:WEBHOOK] ⚠ No handler for event', {
          type: event.type,
          id: event.id,
        });
        break;
    }

    console.log('[REVENANT:WEBHOOK] Event processed', {
      type: event.type,
      id: event.id,
      result: 'success',
    });

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('[REVENANT:WEBHOOK] ❌ Error', {
      type: event.type,
      id: event.id,
      account: stripeAccountId,
      error: error.message,
      stack: error.stack,
    });
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

  // ── 1. Compute retry date (SOFT_TEMPORARY only) ───────────────────────────
  let nextRetryAt = null;
  let nextRetrySource = 'default';

  if (dieCategory === 'SOFT_TEMPORARY') {
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

  // ── 2. Compute Recovery Score ─────────────────────────────────────────────
  const recoveryScore = await computeInvoiceRecoveryScore({
    orgId,
    stripeCustomerId: inv.customer,
    stripeSubscriptionId: inv.subscription,
    dieCategory,
  });

  // ── 3. Propagate Recovery Score to Subscription (feeds customerRisk dimension) ─
  if (recoveryScore !== null && inv.subscription) {
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: inv.subscription, orgId },
      { recoveryScore, recoveryScoreUpdatedAt: new Date() }
    );
  }

  // ── 4. Upsert Invoice ─────────────────────────────────────────────────────
  const invoice = await Invoice.findOneAndUpdate(
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
      recoveryScore,
    },
    { upsert: true, new: true }
  );

  // ── 5. Start dunning sequence (not for HARD_PERMANENT) ────────────────────
  if (dieCategory !== 'HARD_PERMANENT') {
    await startDunningSequence({ invoice, orgId });
  }
}

async function handleInvoicePaymentSucceeded(inv, orgId) {
  // Mark invoice as recovered
  const invoice = await Invoice.findOneAndUpdate(
    { stripeInvoiceId: inv.id, orgId },
    {
      status: 'recovered',
      recoveredAt: new Date(),
      nextRetryAt: null,
    }
  );

  // Stop any active dunning sequence for this invoice
  if (invoice?._id) {
    await stopDunningSequence(invoice._id, 'payment_success');
  }
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
      mrr: computeMRR(sub),
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

async function handleSubscriptionDeleted(sub, orgId) {
  // Mark subscription as canceled in DB
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id, orgId },
    { status: 'canceled' }
  );

  // Stop all active dunning sequences tied to invoices of this subscription
  const invoices = await Invoice.find({ stripeSubscriptionId: sub.id, orgId }).select('_id').lean();
  const invoiceIds = invoices.map((i) => i._id);

  if (invoiceIds.length > 0) {
    await DunningSequence.updateMany(
      { invoiceId: { $in: invoiceIds }, status: 'active' },
      { status: 'stopped', stoppedAt: new Date(), stoppedReason: 'subscription_deleted' }
    );
  }

  console.log('[REVENANT:WEBHOOK] Subscription deleted — canceled in DB', {
    stripeSubscriptionId: sub.id,
    orgId,
    dunningSequencesStopped: invoiceIds.length,
  });
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Computes Recovery Score for an invoice at the moment of failure.
 * Uses subscription tenure, MRR, and past incident history from MongoDB.
 */
async function computeInvoiceRecoveryScore({ orgId, stripeCustomerId, stripeSubscriptionId, dieCategory }) {
  try {
    const sub = await Subscription.findOne({ stripeSubscriptionId, orgId });

    // Tenure: months since subscription start
    let tenureMonths = 0;
    if (sub?.currentPeriodStart) {
      const msPerMonth = 1000 * 60 * 60 * 24 * 30;
      tenureMonths = Math.floor((Date.now() - new Date(sub.currentPeriodStart).getTime()) / msPerMonth);
    }

    // hasIncidents: any prior open or recovered invoices for this customer (excluding current event)
    const priorIncidents = await Invoice.countDocuments({
      orgId,
      stripeCustomerId,
      status: { $in: ['open', 'recovered'] },
    });
    const hasIncidents = priorIncidents > 0;

    // MRR from subscription (in cents)
    const mrrCents = sub?.mrr ?? 0;

    // hasRecentDowngrade: not tracked yet — default to false
    const hasRecentDowngrade = false;

    return computeRecoveryScore({
      tenureMonths,
      hasIncidents,
      mrrCents,
      dieCategory,
      hasRecentDowngrade,
    });
  } catch (err) {
    console.error('[computeInvoiceRecoveryScore] Error:', err);
    return null;
  }
}

/**
 * Creates a DunningSequence with pre-scheduled steps for a failed invoice.
 * No-op if a sequence already exists for this invoice.
 */
async function startDunningSequence({ invoice, orgId }) {
  const delays = SEQUENCE_DELAYS_DAYS[invoice.dieCategory];
  if (!delays) return;

  // Avoid duplicate sequences for the same invoice
  const existing = await DunningSequence.findOne({
    invoiceId: invoice._id,
    status: 'active',
  });
  if (existing) return;

  const steps = delays.map((days, i) => ({
    step: i,
    scheduledAt: new Date(invoice.failedAt.getTime() + days * 86400000),
    sentAt: null,
    emailEventId: null,
  }));

  await DunningSequence.create({
    invoiceId: invoice._id,
    orgId,
    category: invoice.dieCategory,
    status: 'active',
    currentStep: 0,
    steps,
  });
}

/**
 * Marks the active DunningSequence for an invoice as stopped/recovered.
 */
async function stopDunningSequence(invoiceId, reason) {
  await DunningSequence.findOneAndUpdate(
    { invoiceId, status: 'active' },
    {
      status: reason === 'payment_success' ? 'recovered' : 'stopped',
      stoppedAt: new Date(),
      stoppedReason: reason,
    }
  );
}

/**
 * Recomputes the Revenue Health Score from live DB state and persists it to StripeConnection.
 * Called after any payment event that changes invoice status.
 */
async function refreshHealthScore(orgId) {
  try {
    const [openInvoices, activeSubs, totalInvoices, recoveredCount] = await Promise.all([
      Invoice.find({ orgId, status: 'open' }).select('recoveryScore').lean(),
      Subscription.find({ orgId, status: 'active' }).select('mrr recoveryScore cardExpMonth cardExpYear').lean(),
      Invoice.countDocuments({ orgId }),
      Invoice.countDocuments({ orgId, status: 'recovered' }),
    ]);

    const hasData = activeSubs.length > 0 || totalInvoices > 0;
    if (!hasData) {
      console.warn('[refreshHealthScore] ⚠ No data in DB yet — score not updated. Run sync first.');
      return;
    }

    const { total, dimensions } = computeHealthScore({
      activeSubs,
      openInvoices,
      totalInvoices,
      recoveredCount,
      hasConnection: true,
      userId: orgId?.toString(),
    });

    await StripeConnection.updateOne(
      { userId: orgId },
      {
        'healthScore.total': total,
        'healthScore.dimensions': dimensions,
        'healthScore.computedAt': new Date(),
      }
    );

    console.log('[refreshHealthScore] ✅ Score updated', {
      orgId,
      total,
      dimensions,
      activeSubs: activeSubs.length,
      openInvoices: openInvoices.length,
      totalInvoices,
      recoveredCount,
    });
  } catch (err) {
    // Non-critical: log but don't fail the webhook response
    console.error('[refreshHealthScore] Error:', err);
  }
}

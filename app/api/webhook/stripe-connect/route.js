import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { classifyDecline } from '@/libs/die';
import { computeRetryDate } from '@/libs/paydayRetry';
import { computeRecoveryScore } from '@/libs/recoveryScore';
import { computeHealthScore } from '@/libs/healthScore';
import { computeMRR, getClientStripe } from '@/libs/stripeConnect';
import { assessTrialRisk } from '@/libs/smartCharge';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';
import DunningSequence from '@/models/DunningSequence';

const SEQUENCE_DELAYS_DAYS = {
  SOFT_TEMPORARY: [0, 3, 7, 14, 21],
  SOFT_UPDATABLE: [0, 3, 7, 14],
};

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
    console.error('[REVENANT:WEBHOOK] ❌ Signature verification failed', { error: err.message });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

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

      // ── Subscriptions ───────────────────────────────────────────────────────

      case 'customer.subscription.created': {
        const sub = event.data.object;
        await handleSubscriptionUpsert(sub, orgId, stripeAccountId, stripe);
        // SmartCharge: assess trial risk and optionally pre-auth for trialing subs
        if (sub.status === 'trialing') {
          await handleTrialGuard(sub, orgId, stripeAccountId, connection);
        }
        await refreshHealthScore(orgId);
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const previousStatus = event.data.previous_attributes?.status;
        await handleSubscriptionUpsert(sub, orgId, stripeAccountId, stripe);
        // Trial Guard: capture hold when trial converts to active
        if (previousStatus === 'trialing' && sub.status === 'active') {
          await handleTrialGuardCapture(sub, orgId, stripeAccountId, connection);
        }
        // Trial Guard: cancel hold when trial is cancelled
        if (previousStatus === 'trialing' && sub.status === 'canceled') {
          await handleTrialGuardCancel(sub, orgId, stripeAccountId, connection, 'subscription_canceled');
        }
        await refreshHealthScore(orgId);
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await handleSubscriptionDeleted(sub, orgId, stripeAccountId, connection);
        await handleTrialGuardCancel(sub, orgId, stripeAccountId, connection, 'subscription_deleted');
        await refreshHealthScore(orgId);
        break;
      }

      // ── Customers ───────────────────────────────────────────────────────────

      case 'customer.updated': {
        const customer = event.data.object;
        const updateFields = {
          customerEmail: customer.email ?? null,
          customerName: customer.name ?? null,
        };
        await Promise.all([
          Invoice.updateMany({ stripeCustomerId: customer.id, orgId }, updateFields),
          Subscription.updateMany({ stripeCustomerId: customer.id, orgId }, updateFields),
        ]);
        console.log('[REVENANT:WEBHOOK] customer.updated — synced email/name', {
          customerId: customer.id,
          email: customer.email,
        });
        break;
      }

      // ── Invoices ────────────────────────────────────────────────────────────

      case 'invoice.created': {
        const inv = event.data.object;
        // Draft invoices are not finalized yet — skip, we'll handle them at payment_failed/succeeded
        if (inv.status === 'draft') {
          console.log('[REVENANT:WEBHOOK] invoice.created — draft, skipping', { invoiceId: inv.id });
          break;
        }
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
            status: inv.status === 'paid' ? 'recovered' : inv.status,
            customerEmail: inv.customer_email ?? null,
            customerName: inv.customer_name ?? null,
          },
          { upsert: true, new: true }
        );
        console.log('[REVENANT:WEBHOOK] invoice.created — upserted', {
          invoiceId: inv.id,
          status: inv.status,
          amount: inv.amount_due,
        });
        break;
      }

      case 'invoice.payment_failed': {
        await handleInvoicePaymentFailed(event.data.object, orgId, stripeAccountId);
        await refreshHealthScore(orgId);
        break;
      }

      case 'invoice.payment_succeeded': {
        await handleInvoicePaymentSucceeded(event.data.object, orgId);
        await refreshHealthScore(orgId);
        break;
      }

      // ── Payment intents ─────────────────────────────────────────────────────

      case 'payment_intent.succeeded': {
        const pi = event.data.object;
        // Update Trial Guard hold status if this PI is tracked as a hold
        await Subscription.findOneAndUpdate(
          { paymentIntentId: pi.id, orgId },
          { paymentIntentStatus: 'captured' }
        );
        console.log('[TRIAL-GUARD] payment_intent.succeeded — DB updated', {
          paymentIntentId: pi.id,
        });
        break;
      }

      case 'payment_intent.payment_failed': {
        const pi = event.data.object;
        await Subscription.findOneAndUpdate(
          { paymentIntentId: pi.id, orgId },
          { paymentIntentStatus: 'failed' }
        );
        console.log('[TRIAL-GUARD] payment_intent.payment_failed — DB updated', {
          paymentIntentId: pi.id,
          failureCode: pi.last_payment_error?.code ?? null,
        });
        break;
      }

      // ── Payment methods ─────────────────────────────────────────────────────

      case 'payment_method.updated':
      case 'payment_method.attached': {
        await handlePaymentMethodUpdated(event.data.object, orgId);
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

async function handleSubscriptionUpsert(sub, orgId, stripeAccountId, stripe) {
  let cardMeta = {};
  const pmId = sub.default_payment_method;
  if (pmId) {
    try {
      const pm = typeof pmId === 'string'
        ? await stripe.paymentMethods.retrieve(pmId, { stripeAccount: stripeAccountId })
        : pmId;
      cardMeta = {
        paymentMethodId: pm.id,
        cardBrand: pm.card?.brand ?? null,
        cardLast4: pm.card?.last4 ?? null,
        cardExpMonth: pm.card?.exp_month ?? null,
        cardExpYear: pm.card?.exp_year ?? null,
        cardCountry: pm.card?.country ?? null,
      };
    } catch (err) {
      console.error('[REVENANT:WEBHOOK] ⚠ Failed to fetch payment method', {
        pmId,
        error: err.message,
      });
    }
  }

  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

  // Resolve customer email/name — expanded if already an object, otherwise fetch from Stripe
  let customerEmail = null;
  let customerName = null;
  if (typeof sub.customer === 'object' && sub.customer !== null) {
    customerEmail = sub.customer.email ?? null;
    customerName = sub.customer.name ?? null;
  } else if (customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId, { stripeAccount: stripeAccountId });
      customerEmail = customer.email ?? null;
      customerName = customer.name ?? null;
    } catch (err) {
      console.error('[REVENANT:WEBHOOK] ⚠ Failed to fetch customer', {
        customerId,
        error: err.message,
      });
    }
  }

  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id },
    {
      orgId,
      stripeAccountId,
      stripeSubscriptionId: sub.id,
      stripeCustomerId: customerId,
      customerEmail,
      customerName,
      status: sub.status,
      mrr: computeMRR(sub),
      planId: sub.items?.data?.[0]?.price?.id ?? null,
      currentPeriodStart: sub.current_period_start
        ? new Date(sub.current_period_start * 1000) : null,
      currentPeriodEnd: sub.current_period_end
        ? new Date(sub.current_period_end * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
      ...cardMeta,
    },
    { upsert: true, new: true }
  );

  console.log('[REVENANT:WEBHOOK] Subscription upserted', {
    stripeSubscriptionId: sub.id,
    status: sub.status,
    customerId,
    customerEmail,
  });
}

async function handleSubscriptionDeleted(sub, orgId, stripeAccountId, connection) {
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id, orgId },
    { status: 'canceled' }
  );

  const invoices = await Invoice.find({
    stripeSubscriptionId: sub.id,
    orgId,
    status: 'open',
  }).select('_id').lean();

  for (const inv of invoices) {
    await stopDunningSequence(inv._id, 'subscription_canceled');
  }

  console.log('[REVENANT:WEBHOOK] Subscription deleted', {
    stripeSubscriptionId: sub.id,
    invoicesStopped: invoices.length,
  });
}

// ── Trial Guard handlers ──────────────────────────────────────────────────────

async function handleTrialGuard(sub, orgId, stripeAccountId, connection) {
  // 1. Trial Guard must be active for this account
  if (!connection.trialGuardActive) {
    console.log('[TRIAL-GUARD] Inactive for this account — skipping', { subscriptionId: sub.id });
    return;
  }

  // 2. Constraint: only support trials ≤ 7 days (Stripe hold max duration)
  if (!sub.trial_end) {
    console.log('[TRIAL-GUARD] No trial_end — skipping', { subscriptionId: sub.id });
    return;
  }

  const trialDurationDays = (sub.trial_end - Math.floor(Date.now() / 1000)) / 86400;
  if (trialDurationDays > 7) {
    console.log('[TRIAL-GUARD] Trial > 7 days — skipping', {
      subscriptionId: sub.id,
      trialDurationDays: Math.round(trialDurationDays),
    });
    return;
  }

  // 3. No payment method attached — cannot place a hold
  const pmId = sub.default_payment_method;
  if (!pmId) {
    console.log('[TRIAL-GUARD] No payment method — skipping', { subscriptionId: sub.id });
    return;
  }

  const trialGuardMode = connection.trialGuardMode ?? 'universal';
  const clientStripe = getClientStripe(connection.accessToken);

  // 4. Retrieve payment method and scan risk signals
  let pm;
  try {
    pm = await clientStripe.paymentMethods.retrieve(pmId);
  } catch (err) {
    console.error('[TRIAL-GUARD] Failed to retrieve payment method', { pmId, error: err.message });
    return;
  }

  const radarThreshold = connection.settings?.trialGuard?.radarThreshold ?? 65;
  const { risks } = assessTrialRisk(pm, sub, radarThreshold);

  // 5. Decision: place hold or monitor only
  const shouldPlaceHold = trialGuardMode === 'universal' || risks.length > 0;

  if (!shouldPlaceHold) {
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id, orgId },
      {
        trialGuardEnabled: true,
        trialGuardMode: 'selective',
        riskSignals: [],
        paymentIntentStatus: null,
      }
    );
    console.log('[TRIAL-GUARD] Selective mode — no risk signal — monitoring only', {
      subscriptionId: sub.id,
    });
    return;
  }

  // 6. Get exact plan amount (brief section 4: use subscriptionAmount, not $1)
  const holdAmount = sub.items?.data?.[0]?.price?.unit_amount ?? 100;
  const holdCurrency = sub.items?.data?.[0]?.price?.currency ?? 'usd';
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;

  // 7. Create PaymentIntent with idempotency key
  let paymentIntent;
  try {
    paymentIntent = await clientStripe.paymentIntents.create(
      {
        amount: holdAmount,
        currency: holdCurrency,
        customer: customerId,
        payment_method: pmId,
        capture_method: 'manual',
        confirm: true,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/api/trial-guard/confirm`,
      },
      {
        idempotencyKey: `trial-guard-${sub.id}`,
        stripeAccount: stripeAccountId,
      }
    );
  } catch (err) {
    console.error('[TRIAL-GUARD] PaymentIntent creation failed — cancelling subscription', {
      subscriptionId: sub.id,
      error: err.message,
    });
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id, orgId },
      {
        trialGuardEnabled: true,
        trialGuardMode,
        riskSignals: risks,
        paymentIntentStatus: 'failed',
      }
    );
    // Block the trial: cancel the subscription (brief section 6)
    try {
      await clientStripe.subscriptions.cancel(sub.id);
      console.log('[TRIAL-GUARD] Subscription cancelled after hold failure', { subscriptionId: sub.id });
    } catch (cancelErr) {
      console.error('[TRIAL-GUARD] Failed to cancel subscription', { subscriptionId: sub.id, error: cancelErr.message });
    }
    return;
  }

  // 8. Handle PaymentIntent status
  let finalStatus;
  if (paymentIntent.status === 'requires_action') {
    // 3DS required — store as pending, confirm route handles the callback
    finalStatus = 'pending';
    console.log('[TRIAL-GUARD] 3DS required — hold pending', {
      subscriptionId: sub.id,
      paymentIntentId: paymentIntent.id,
      redirectUrl: paymentIntent.next_action?.redirect_to_url?.url,
    });
  } else if (paymentIntent.status === 'requires_capture') {
    finalStatus = 'held';
  } else {
    // Unexpected status — treat as failure, cancel subscription
    finalStatus = 'failed';
    console.error('[TRIAL-GUARD] Unexpected PaymentIntent status — cancelling subscription', {
      subscriptionId: sub.id,
      status: paymentIntent.status,
    });
    try {
      await clientStripe.subscriptions.cancel(sub.id);
    } catch (cancelErr) {
      console.error('[TRIAL-GUARD] Failed to cancel subscription', { subscriptionId: sub.id, error: cancelErr.message });
    }
  }

  // 9. Persist to Subscription
  const holdCreatedAt = new Date();
  await Subscription.findOneAndUpdate(
    { stripeSubscriptionId: sub.id, orgId },
    {
      trialGuardEnabled: true,
      trialGuardMode,
      riskSignals: risks,
      paymentIntentId: paymentIntent.id,
      paymentIntentStatus: finalStatus,
      holdAmount,
      holdCurrency,
      holdCreatedAt,
      holdExpiresAt: new Date(holdCreatedAt.getTime() + 7 * 86400000),
    },
    { upsert: true }
  );

  console.log('[TRIAL-GUARD] Hold placed', {
    subscriptionId: sub.id,
    paymentIntentId: paymentIntent.id,
    status: finalStatus,
    amount: holdAmount,
    currency: holdCurrency,
    riskSignals: risks,
    mode: trialGuardMode,
  });
}

async function handleTrialGuardCapture(sub, orgId, stripeAccountId, connection) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: sub.id,
    orgId,
    paymentIntentStatus: 'held',
  });

  if (!subscription?.paymentIntentId) return;

  const clientStripe = getClientStripe(connection.accessToken);
  try {
    await clientStripe.paymentIntents.capture(
      subscription.paymentIntentId,
      {},
      { stripeAccount: stripeAccountId }
    );
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id, orgId },
      { paymentIntentStatus: 'captured' }
    );
    console.log('[TRIAL-GUARD] Hold captured', {
      subscriptionId: sub.id,
      paymentIntentId: subscription.paymentIntentId,
    });
  } catch (err) {
    console.error('[TRIAL-GUARD] Capture failed', {
      subscriptionId: sub.id,
      paymentIntentId: subscription.paymentIntentId,
      error: err.message,
    });
  }
}

async function handleTrialGuardCancel(sub, orgId, stripeAccountId, connection, reason) {
  const subscription = await Subscription.findOne({
    stripeSubscriptionId: sub.id,
    orgId,
    paymentIntentStatus: 'held',
  });

  if (!subscription?.paymentIntentId) return;

  const clientStripe = getClientStripe(connection.accessToken);
  try {
    await clientStripe.paymentIntents.cancel(
      subscription.paymentIntentId,
      {},
      { stripeAccount: stripeAccountId }
    );
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: sub.id, orgId },
      { paymentIntentStatus: 'cancelled' }
    );
    console.log('[TRIAL-GUARD] Hold cancelled', {
      subscriptionId: sub.id,
      paymentIntentId: subscription.paymentIntentId,
      reason,
    });
  } catch (err) {
    console.error('[TRIAL-GUARD] Cancel failed', {
      subscriptionId: sub.id,
      paymentIntentId: subscription.paymentIntentId,
      error: err.message,
    });
  }
}

async function handleInvoicePaymentFailed(inv, orgId, stripeAccountId) {
  const failureCode = inv.last_payment_error?.code ?? null;
  const dieCategory = classifyDecline(failureCode);

  const failedAt = inv.status_transitions?.past_due_at
    ? new Date(inv.status_transitions.past_due_at * 1000)
    : new Date();

  let nextRetryAt = null;
  let nextRetrySource = 'default';

  if (dieCategory === 'SOFT_TEMPORARY') {
    const sub = await Subscription.findOne({ stripeSubscriptionId: inv.subscription, orgId });
    const retryResult = computeRetryDate({
      failedAt,
      inferredPaydayCycle: sub?.inferredPaydayCycle ?? null,
      customerCountry: sub?.cardCountry ?? null,
    });
    nextRetryAt = retryResult.retryAt;
    nextRetrySource = retryResult.source;
  }

  const recoveryScore = await computeInvoiceRecoveryScore({
    orgId,
    stripeCustomerId: inv.customer,
    stripeSubscriptionId: inv.subscription,
    dieCategory,
  });

  if (recoveryScore !== null && inv.subscription) {
    await Subscription.findOneAndUpdate(
      { stripeSubscriptionId: inv.subscription, orgId },
      { recoveryScore, recoveryScoreUpdatedAt: new Date() }
    );
  }

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

  if (dieCategory !== 'HARD_PERMANENT') {
    await startDunningSequence({ invoice, orgId });
  }
}

async function handleInvoicePaymentSucceeded(inv, orgId) {
  const invoice = await Invoice.findOneAndUpdate(
    { stripeInvoiceId: inv.id, orgId },
    { status: 'recovered', recoveredAt: new Date(), nextRetryAt: null }
  );

  if (!invoice) {
    console.log('[REVENANT:WEBHOOK] invoice.payment_succeeded — not tracked, skipping', {
      stripeInvoiceId: inv.id,
    });
    return;
  }

  await stopDunningSequence(invoice._id, 'payment_success');
}

async function handlePaymentMethodUpdated(pm, orgId) {
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

async function computeInvoiceRecoveryScore({ orgId, stripeCustomerId, stripeSubscriptionId, dieCategory }) {
  try {
    const sub = await Subscription.findOne({ stripeSubscriptionId, orgId });
    let tenureMonths = 0;
    if (sub?.currentPeriodStart) {
      tenureMonths = Math.floor(
        (Date.now() - new Date(sub.currentPeriodStart).getTime()) / (1000 * 60 * 60 * 24 * 30)
      );
    }
    const priorIncidents = await Invoice.countDocuments({
      orgId,
      stripeCustomerId,
      status: { $in: ['open', 'recovered'] },
    });
    return computeRecoveryScore({
      tenureMonths,
      hasIncidents: priorIncidents > 0,
      mrrCents: sub?.mrr ?? 0,
      dieCategory,
      hasRecentDowngrade: false,
    });
  } catch (err) {
    console.error('[computeInvoiceRecoveryScore] Error:', err);
    return null;
  }
}

async function startDunningSequence({ invoice, orgId }) {
  const delays = SEQUENCE_DELAYS_DAYS[invoice.dieCategory];
  if (!delays) return;
  const existing = await DunningSequence.findOne({ invoiceId: invoice._id, status: 'active' });
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

async function refreshHealthScore(orgId) {
  try {
    const [openInvoices, activeSubs, totalInvoices, recoveredCount] = await Promise.all([
      Invoice.find({ orgId, status: 'open' }).select('recoveryScore').lean(),
      Subscription.find({ orgId, status: 'active' }).select('mrr recoveryScore cardExpMonth cardExpYear').lean(),
      Invoice.countDocuments({ orgId }),
      Invoice.countDocuments({ orgId, status: 'recovered' }),
    ]);
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
  } catch (err) {
    console.error('[refreshHealthScore] Error:', err);
  }
}

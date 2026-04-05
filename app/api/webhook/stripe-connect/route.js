import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { classifyDecline } from '@/libs/die';
import { computeRetryDate } from '@/libs/paydayRetry';
import { computeRecoveryScore } from '@/libs/recoveryScore';
import { computeHealthScore } from '@/libs/healthScore';
import { computeMRR, getClientStripe } from '@/libs/stripeConnect';
import { decrypt } from '@/libs/encryption';
import { assessTrialRisk, createPreAuth, capturePreAuth, cancelPreAuth } from '@/libs/smartCharge';
import { sendEmail } from '@/libs/resend';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';
import DunningSequence from '@/models/DunningSequence';
import TrialGuard from '@/models/TrialGuard';
import User from '@/models/User';

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
        // SmartCharge: capture pre-auth when trial converts to active
        if (previousStatus === 'trialing' && sub.status === 'active') {
          await handleTrialGuardCapture(sub, orgId, stripeAccountId, connection);
        }
        await refreshHealthScore(orgId);
        break;
      }

      case 'customer.subscription.deleted': {
        await handleSubscriptionDeleted(event.data.object, orgId, stripeAccountId, connection);
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
        // payment_intent.succeeded fires for every successful charge, including new subscriptions.
        // invoice.payment_succeeded handles the same outcome — this event is redundant for REVENANT.
        // Log and skip to avoid double-processing.
        console.log('[REVENANT:WEBHOOK] payment_intent.succeeded — no action needed', {
          paymentIntentId: pi.id,
          invoiceId: pi.invoice ?? null,
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

  // SmartCharge: cancel pre-auth hold if trial was cancelled
  const trialGuard = await TrialGuard.findOne({
    stripeSubscriptionId: sub.id,
    status: 'hold_active',
  });

  if (trialGuard?.paymentIntentId) {
    const clientStripe = getClientStripe(connection.accessToken);
    const cancelled = await cancelPreAuth(clientStripe, trialGuard.paymentIntentId, stripeAccountId);
    await TrialGuard.findByIdAndUpdate(trialGuard._id, {
      status: 'cancelled',
      cancelledAt: new Date(),
    });
    console.log('[REVENANT:SMARTCHARGE] Pre-auth cancelled on subscription delete', {
      stripeSubscriptionId: sub.id,
      paymentIntentId: trialGuard.paymentIntentId,
      cancelled,
    });
  }

  console.log('[REVENANT:WEBHOOK] Subscription deleted', {
    stripeSubscriptionId: sub.id,
    invoicesStopped: invoices.length,
  });
}

// ── SmartCharge handlers ──────────────────────────────────────────────────────

async function handleTrialGuard(sub, orgId, stripeAccountId, connection) {
  // Read per-account settings (with safe defaults)
  const tgSettings = connection.settings?.trialGuard ?? {};
  const trialGuardEnabled  = tgSettings.enabled !== false; // default: true
  const radarThreshold     = typeof tgSettings.radarThreshold === 'number' ? tgSettings.radarThreshold : 65;

  const pmId       = sub.default_payment_method;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
  const clientStripe = getClientStripe(connection.accessToken);

  // Retrieve customer readable data
  let customerEmail = null;
  let customerName  = null;
  try {
    const customer = await clientStripe.customers.retrieve(customerId);
    customerEmail = customer.email ?? null;
    customerName  = customer.name ?? null;
  } catch (err) {
    console.error('[REVENANT:SMARTCHARGE] Failed to retrieve customer', { customerId, error: err.message });
  }

  const baseFields = {
    orgId, stripeAccountId,
    stripeCustomerId:      customerId,
    stripeSubscriptionId:  sub.id,
    customerEmail,
    customerName,
    trialEnd: sub.trial_end ? new Date(sub.trial_end * 1000) : null,
  };

  // Trial Guard disabled by the founder — monitor only, no pre-auth
  if (!trialGuardEnabled) {
    await TrialGuard.create({ ...baseFields, paymentIntentId: null, riskSignals: [], isHighRisk: false, status: 'monitoring' });
    console.log('[REVENANT:SMARTCHARGE] Trial Guard disabled — monitoring only', { stripeSubscriptionId: sub.id });
    return;
  }

  // No payment method attached — monitor only
  if (!pmId) {
    await TrialGuard.create({ ...baseFields, paymentIntentId: null, riskSignals: [], isHighRisk: false, status: 'monitoring' });
    console.log('[REVENANT:SMARTCHARGE] No payment method — monitoring only', { stripeSubscriptionId: sub.id });
    return;
  }

  // Retrieve payment method from the connected account
  let pm;
  try {
    pm = await clientStripe.paymentMethods.retrieve(pmId);
  } catch (err) {
    console.error('[REVENANT:SMARTCHARGE] Failed to retrieve payment method', { pmId, stripeAccountId, error: err.message });
    return;
  }

  const cardData = {
    cardLast4:    pm.card?.last4    ?? null,
    cardBrand:    pm.card?.brand    ?? null,
    cardExpMonth: pm.card?.exp_month ?? null,
    cardExpYear:  pm.card?.exp_year  ?? null,
    cardFunding:  pm.card?.funding  ?? null,
  };

  const { isHighRisk, risks } = assessTrialRisk(pm, sub, radarThreshold);

  // ── 7-day pre-auth window constraint ──────────────────────────────────────
  // Stripe pre-auth holds expire after 7 days. If the trial lasts longer,
  // the hold would expire before the subscription converts — useless.
  const SEVEN_DAYS_MS    = 7 * 24 * 60 * 60 * 1000;
  const trialRemainingMs = sub.trial_end ? (sub.trial_end * 1000 - Date.now()) : 0;
  const trialTooLong     = trialRemainingMs > SEVEN_DAYS_MS;

  console.log('[REVENANT:SMARTCHARGE] Risk assessment', {
    stripeSubscriptionId: sub.id, customerId, isHighRisk, risks,
    radarThreshold, trialTooLong,
    trialRemainingDays: Math.ceil(trialRemainingMs / 86400000),
  });

  if (!isHighRisk || trialTooLong) {
    await TrialGuard.create({
      ...baseFields, ...cardData,
      paymentIntentId: null,
      riskSignals: risks,
      // Mark isHighRisk correctly even if we can't pre-auth (for dashboard visibility)
      isHighRisk: isHighRisk && !trialTooLong,
      status: 'monitoring',
    });
    if (trialTooLong && isHighRisk) {
      console.log('[REVENANT:SMARTCHARGE] High-risk but trial > 7 days — pre-auth skipped, monitoring only', {
        stripeSubscriptionId: sub.id, risks,
        trialRemainingDays: Math.ceil(trialRemainingMs / 86400000),
      });
    }
    return;
  }

  // ── High-risk + within 7-day window → attempt pre-auth ───────────────────
  const paymentIntent = await createPreAuth(clientStripe, {
    customerId, paymentMethodId: pmId, stripeAccountId, amount: 100,
  });

  const status = paymentIntent ? 'hold_active' : 'failed';

  await TrialGuard.create({
    ...baseFields, ...cardData,
    paymentIntentId: paymentIntent?.id ?? null,
    riskSignals: risks,
    isHighRisk: true,
    status,
    preAuthAmount: 100,
    ...(status === 'failed' ? { failedAt: new Date() } : {}),
  });

  console.log('[REVENANT:SMARTCHARGE] Pre-auth', {
    stripeSubscriptionId: sub.id, customerId, status,
    paymentIntentId: paymentIntent?.id ?? null, risks,
  });

  // ── Notify founder when pre-auth hold is placed ───────────────────────────
  if (status === 'hold_active') {
    try {
      const founder = await User.findById(orgId).select('email').lean();
      if (founder?.email) {
        const signalLabels = {
          prepaid_card:                  'Prepaid card',
          card_expires_before_trial_end: 'Card expires before trial end',
          high_radar_score:              'High Radar risk score',
        };
        const signalsList    = risks.map((r) => `• ${signalLabels[r] ?? r}`).join('\n');
        const customerLabel  = customerName || customerEmail || customerId;
        const cardLabel      = cardData.cardBrand
          ? `${cardData.cardBrand.charAt(0).toUpperCase() + cardData.cardBrand.slice(1)} ···${cardData.cardLast4}`
          : 'Unknown card';

        await sendEmail({
          to: founder.email,
          subject: `[REVENANT] High-risk trial detected — ${customerLabel}`,
          html: `<p>A high-risk trial signup was detected and a <strong>$1.00 pre-authorization hold</strong> has been placed on the card.</p>
<p>
  <strong>Customer:</strong> ${customerLabel}${customerEmail && customerName ? ` (${customerEmail})` : ''}<br/>
  <strong>Card:</strong> ${cardLabel}${cardData.cardFunding === 'prepaid' ? ' — <em>Prepaid</em>' : ''}<br/>
  <strong>Trial ends:</strong> ${sub.trial_end ? new Date(sub.trial_end * 1000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Unknown'}
</p>
<p><strong>Risk signals:</strong></p>
<pre style="background:#FEF2F2;padding:10px;border-radius:4px">${signalsList}</pre>
<p>REVENANT will automatically capture the hold when the trial converts to an active subscription, and release it if the trial is cancelled.</p>`,
          text: `High-risk trial detected: ${customerLabel}\nCard: ${cardLabel}\n\nRisk signals:\n${signalsList}\n\nREVENANT has placed a $1.00 pre-auth hold. It will be captured on trial conversion.`,
        });
      }
    } catch (err) {
      console.error('[REVENANT:SMARTCHARGE] Founder notification failed', { error: err.message });
    }
  }

  // ── Pre-auth failed → notify customer to update their card ────────────────
  // The hold was rejected (3DS required or card declined). Ask the customer
  // to update their payment method so the trial can convert smoothly.
  if (status === 'failed' && customerEmail) {
    try {
      const name = customerName || 'there';
      await sendEmail({
        to: customerEmail,
        subject: 'Action required: please update your payment method',
        html: `<p>Hi ${name},</p>
<p>We were unable to verify the payment method linked to your trial subscription.</p>
<p>Please update your card to ensure uninterrupted access when your trial period ends.</p>
<p>Thanks,<br/>The team</p>`,
        text: `Hi ${name},\n\nWe were unable to verify the payment method linked to your trial subscription. Please update your card to ensure uninterrupted access when your trial period ends.\n\nThanks,\nThe team`,
      });
      console.log('[REVENANT:SMARTCHARGE] Customer notified of payment method issue', { customerEmail });
    } catch (err) {
      console.error('[REVENANT:SMARTCHARGE] Customer notification failed', { error: err.message });
    }
  }
}

async function handleTrialGuardCapture(sub, orgId, stripeAccountId, connection) {
  const trialGuard = await TrialGuard.findOne({
    stripeSubscriptionId: sub.id,
    status: 'hold_active',
  });

  if (!trialGuard?.paymentIntentId) return;

  const clientStripe = getClientStripe(connection.accessToken);
  const success = await capturePreAuth(clientStripe, trialGuard.paymentIntentId, stripeAccountId);

  await TrialGuard.findByIdAndUpdate(trialGuard._id, {
    status: success ? 'captured' : 'failed',
    ...(success ? { capturedAt: new Date() } : { failedAt: new Date() }),
  });

  console.log('[REVENANT:SMARTCHARGE] Pre-auth captured', {
    stripeSubscriptionId: sub.id,
    paymentIntentId: trialGuard.paymentIntentId,
    success,
  });
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

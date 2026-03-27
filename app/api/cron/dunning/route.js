import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { sendEmail } from '@/libs/resend';
import DunningSequence from '@/models/DunningSequence';
import Invoice from '@/models/Invoice';
import Subscription from '@/models/Subscription';
import EmailEvent from '@/models/EmailEvent';

/**
 * GET /api/cron/dunning
 * Runs every hour — sends pending dunning emails for active sequences.
 * Secured by Vercel's built-in CRON_SECRET header.
 *
 * For each active DunningSequence:
 *   1. Find the next step whose scheduledAt <= now and sentAt is null
 *   2. Load the associated Invoice + Subscription (for customer details)
 *   3. Send the appropriate email (SOFT_TEMPORARY vs SOFT_UPDATABLE, step 0-4)
 *   4. Mark the step as sent, record an EmailEvent
 *   5. If all steps are sent, mark the sequence as completed
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const now = new Date();

    // ── 1. Find all active sequences with at least one overdue unsent step ────
    const sequences = await DunningSequence.find({
      status: 'active',
      steps: {
        $elemMatch: {
          scheduledAt: { $lte: now },
          sentAt: null,
        },
      },
    }).lean();

    if (sequences.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0 });
    }

    // ── 2. Batch-load all related invoices and subscriptions ──────────────────
    const invoiceIds = [...new Set(sequences.map((s) => s.invoiceId.toString()))];
    const invoices = await Invoice.find({ _id: { $in: invoiceIds } }).lean();
    const invoiceById = new Map(invoices.map((inv) => [inv._id.toString(), inv]));

    const subIds = [
      ...new Set(
        invoices
          .filter((inv) => inv.stripeSubscriptionId)
          .map((inv) => inv.stripeSubscriptionId)
      ),
    ];
    const subscriptions = await Subscription.find({
      stripeSubscriptionId: { $in: subIds },
    }).lean();
    const subByStripeId = new Map(subscriptions.map((s) => [s.stripeSubscriptionId, s]));

    // ── 3. Process each sequence ──────────────────────────────────────────────
    let sent = 0;
    const bulkEmailEvents = [];
    const bulkSequenceUpdates = [];

    for (const seq of sequences) {
      const invoice = invoiceById.get(seq.invoiceId.toString());
      if (!invoice) continue;

      const sub = invoice.stripeSubscriptionId
        ? subByStripeId.get(invoice.stripeSubscriptionId)
        : null;

      const customerEmail = invoice.customerEmail;
      if (!customerEmail) continue;

      // Find all overdue unsent steps (process one per run to avoid flooding)
      const overdueSteps = seq.steps.filter(
        (step) => step.scheduledAt <= now && !step.sentAt
      );

      if (overdueSteps.length === 0) continue;

      // Send only the earliest overdue step
      const stepToSend = overdueSteps.sort(
        (a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt)
      )[0];

      try {
        const result = await sendDunningEmail({
          to: customerEmail,
          customerName: invoice.customerName,
          category: seq.category,
          step: stepToSend.step,
          amountCents: invoice.amount,
          cardLast4: sub?.cardLast4,
          cardBrand: sub?.cardBrand,
        });

        const emailEvent = {
          orgId: seq.orgId,
          invoiceId: seq.invoiceId,
          subscriptionId: sub?._id ?? null,
          stripeCustomerId: invoice.stripeCustomerId,
          type: seq.category === 'SOFT_TEMPORARY'
            ? 'dunning_soft_temporary'
            : 'dunning_soft_updatable',
          step: stepToSend.step,
          resendMessageId: result?.id ?? null,
          sentAt: now,
        };
        bulkEmailEvents.push(emailEvent);

        // Check if all steps are now sent (including this one)
        const remainingUnsent = seq.steps.filter(
          (s) => s.step !== stepToSend.step && !s.sentAt
        );
        const isComplete = remainingUnsent.length === 0;

        bulkSequenceUpdates.push({
          _id: seq._id,
          stepIndex: seq.steps.findIndex((s) => s.step === stepToSend.step),
          isComplete,
        });

        sent++;
      } catch (err) {
        console.error(
          `[cron/dunning] email failed for seq=${seq._id} step=${stepToSend.step}:`,
          err.message
        );
      }
    }

    // ── 4. Persist all updates ────────────────────────────────────────────────
    if (bulkEmailEvents.length > 0) {
      const insertedEvents = await EmailEvent.insertMany(bulkEmailEvents, { ordered: false });

      // Map from (seqId, step) → emailEventId for linkage
      const eventBySeqStep = new Map();
      for (let i = 0; i < bulkSequenceUpdates.length; i++) {
        const update = bulkSequenceUpdates[i];
        eventBySeqStep.set(`${update._id}:${update.stepIndex}`, insertedEvents[i]?._id);
      }

      // Update each sequence: mark step as sent, advance currentStep, maybe complete
      await Promise.all(
        bulkSequenceUpdates.map(async (update) => {
          const emailEventId = eventBySeqStep.get(`${update._id}:${update.stepIndex}`);
          const setOp = {
            [`steps.${update.stepIndex}.sentAt`]: now,
            [`steps.${update.stepIndex}.emailEventId`]: emailEventId,
            currentStep: update.stepIndex + 1,
          };
          if (update.isComplete) {
            setOp.status = 'completed';
          }
          await DunningSequence.findByIdAndUpdate(update._id, { $set: setOp });
        })
      );
    }

    console.log(
      `[cron/dunning] sequences=${sequences.length} sent=${sent}`
    );

    return NextResponse.json({
      processed: sequences.length,
      sent,
    });

  } catch (error) {
    console.error('[cron/dunning]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Email templates ───────────────────────────────────────────────────────────

const SOFT_TEMPORARY_EMAILS = [
  {
    subject: (name) => `Your recent payment didn't go through`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>We tried to process your payment of <strong>${amount}</strong> but it was temporarily declined — this is usually caused by a bank hold or insufficient funds.</p>
<p>No action needed on your end. We'll automatically retry the payment in the next few days.</p>
<p>If you'd like to resolve this sooner, you can contact your bank to authorize the payment.</p>
<p>Thanks,<br/>The team</p>`,
  },
  {
    subject: (name) => `Reminder: your payment is still pending`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>Your payment of <strong>${amount}</strong> is still pending. We've tried again and will keep retrying over the next two weeks.</p>
<p>This is often resolved automatically when funds become available. No action is required from you.</p>
<p>Thanks for your patience.</p>
<p>Thanks,<br/>The team</p>`,
  },
  {
    subject: (name) => `Week 1: still working on your payment`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>We're still working on processing your payment of <strong>${amount}</strong>. We've attempted the charge several times and will continue for another week.</p>
<p>If you think there might be an issue with your payment method, now is a good time to update it to avoid any service interruption.</p>
<p>Thanks,<br/>The team</p>`,
  },
  {
    subject: (name) => `Action may be needed on your account`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>We've been unable to process your payment of <strong>${amount}</strong> for over two weeks.</p>
<p>We'll make one final attempt soon. If payment continues to fail, your subscription may be paused.</p>
<p>To avoid any interruption, please check that your payment method is valid and has sufficient funds.</p>
<p>Thanks,<br/>The team</p>`,
  },
  {
    subject: (name) => `Final notice: your subscription may be paused`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>This is a final notice regarding your unpaid balance of <strong>${amount}</strong>.</p>
<p>We've attempted to collect payment multiple times over the past three weeks without success. Your subscription will be paused if we cannot process payment.</p>
<p>Please update your payment method or contact your bank as soon as possible to keep your subscription active.</p>
<p>Thanks,<br/>The team</p>`,
  },
];

const SOFT_UPDATABLE_EMAILS = [
  {
    subject: (name, cardBrand, cardLast4) =>
      cardBrand && cardLast4
        ? `Your ${cardBrand} card ending in ${cardLast4} needs to be updated`
        : `Your payment method needs to be updated`,
    html: (name, amount, cardBrand, cardLast4) => {
      const card =
        cardBrand && cardLast4 ? `${cardBrand} card ending in ${cardLast4}` : 'your card';
      return `<p>Hi ${name},</p>
<p>We were unable to charge your subscription of <strong>${amount}</strong> because ${card} has expired or been cancelled.</p>
<p>Please update your payment method to continue your subscription without interruption.</p>
<p>Thanks,<br/>The team</p>`;
    },
  },
  {
    subject: () => `Reminder: please update your payment method`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>We still haven't been able to process your payment of <strong>${amount}</strong>. Your card on file cannot be charged.</p>
<p>Please update your payment method as soon as possible to avoid any service disruption.</p>
<p>Thanks,<br/>The team</p>`,
  },
  {
    subject: () => `Your subscription is at risk — action required`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>We've now attempted your payment of <strong>${amount}</strong> multiple times without success.</p>
<p>Your subscription will be cancelled if we cannot collect payment within the next week. Please update your card to keep your account active.</p>
<p>Thanks,<br/>The team</p>`,
  },
  {
    subject: () => `Final notice: update your card to keep your subscription`,
    html: (name, amount) =>
      `<p>Hi ${name},</p>
<p>This is our final notice regarding your unpaid balance of <strong>${amount}</strong>.</p>
<p>We are unable to recover this payment without a valid card on file. Your subscription will be cancelled if no action is taken.</p>
<p>Please update your payment method immediately to avoid losing access.</p>
<p>Thanks,<br/>The team</p>`,
  },
];

function formatAmount(cents) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function sendDunningEmail({ to, customerName, category, step, amountCents, cardLast4, cardBrand }) {
  const name = customerName || 'there';
  const amount = formatAmount(amountCents);
  const templates =
    category === 'SOFT_TEMPORARY' ? SOFT_TEMPORARY_EMAILS : SOFT_UPDATABLE_EMAILS;
  const template = templates[Math.min(step, templates.length - 1)];

  const subject = template.subject(name, cardBrand, cardLast4);
  const html =
    category === 'SOFT_TEMPORARY'
      ? template.html(name, amount)
      : template.html(name, amount, cardBrand, cardLast4);

  return sendEmail({ to, subject, html, text: html.replace(/<[^>]+>/g, '') });
}

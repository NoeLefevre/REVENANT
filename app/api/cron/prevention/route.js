import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { sendEmail } from '@/libs/resend';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import EmailEvent from '@/models/EmailEvent';

/**
 * GET /api/cron/prevention
 * Daily cron (08:00 UTC) — card expiry alerts + Chargeback Shield pre-debit emails.
 * Secured by Vercel's built-in CRON_SECRET header.
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // ── 1. Load all active connections in one query ───────────────────────────
    const connections = await StripeConnection.find({ syncStatus: 'done' }).lean();

    if (connections.length === 0) {
      return NextResponse.json({ accounts: 0, expiryEmailsSent: 0, chargebackShieldSent: 0 });
    }

    const orgIds = connections.map((c) => c.userId);

    // ── 2. Load all relevant subscriptions in one query ───────────────────────
    const subscriptions = await Subscription.find({
      orgId: { $in: orgIds },
      status: { $in: ['active', 'trialing'] },
      customerEmail: { $exists: true, $ne: null },
      cardExpMonth: { $exists: true, $ne: null },
      cardExpYear: { $exists: true, $ne: null },
    }).lean();

    if (subscriptions.length === 0) {
      return NextResponse.json({ accounts: connections.length, expiryEmailsSent: 0, chargebackShieldSent: 0 });
    }

    const subIds = subscriptions.map((s) => s._id);

    // ── 3. Load all recent EmailEvents for these subscriptions in one query ───
    // We need events since monthStart (expiry dedup) and since currentPeriodStart (chargeback dedup).
    // Using monthStart as the lower bound covers both cases.
    const recentEvents = await EmailEvent.find({
      subscriptionId: { $in: subIds },
      type: { $in: ['expiry_j30', 'expiry_j14', 'expiry_j7', 'chargeback_shield'] },
      sentAt: { $gte: monthStart },
    }).lean();

    // Index events by subscriptionId+type for O(1) lookup
    // Key: `${subscriptionId}:${type}` → earliest sentAt for that combo
    const eventIndex = new Map();
    for (const ev of recentEvents) {
      const key = `${String(ev.subscriptionId)}:${ev.type}`;
      const existing = eventIndex.get(key);
      if (!existing || ev.sentAt < existing) {
        eventIndex.set(key, ev.sentAt);
      }
    }

    // ── 4. Process subscriptions in memory ────────────────────────────────────
    let expiryEmailsSent = 0;
    let chargebackShieldSent = 0;
    const emailCreateOps = [];

    for (const sub of subscriptions) {
      const days = daysUntilCardExpiry(sub.cardExpMonth, sub.cardExpYear, now);

      // ── Expiry alerts ────────────────────────────────────────────────────────
      if (days >= 0 && days <= 30) {
        const emailType = days <= 7 ? 'expiry_j7' : days <= 14 ? 'expiry_j14' : 'expiry_j30';
        const dedupKey = `${String(sub._id)}:${emailType}`;
        const alreadySent = eventIndex.has(dedupKey);

        if (!alreadySent) {
          try {
            const result = await sendExpiryEmail({
              to: sub.customerEmail,
              customerName: sub.customerName,
              cardBrand: sub.cardBrand,
              cardLast4: sub.cardLast4,
              daysUntilExpiry: days,
              type: emailType,
            });

            emailCreateOps.push({
              orgId: sub.orgId,
              subscriptionId: sub._id,
              stripeCustomerId: sub.stripeCustomerId,
              type: emailType,
              resendMessageId: result?.id ?? null,
              sentAt: now,
            });

            // Update index to prevent double-send within same cron run
            eventIndex.set(dedupKey, now);
            expiryEmailsSent++;
          } catch (err) {
            console.error(`[cron/prevention] expiry email failed sub=${sub.stripeSubscriptionId}:`, err.message);
          }
        }
      }

      // ── Chargeback Shield ────────────────────────────────────────────────────
      const billingInWindow =
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd > now &&
        sub.currentPeriodEnd <= in7Days;

      if (sub.recoveryScore !== null && sub.recoveryScore < 40 && billingInWindow) {
        const cycleStart = sub.currentPeriodStart ?? monthStart;
        // Chargeback dedup uses cycle start — check if event sent since cycle start
        const eventsForSub = recentEvents.filter(
          (ev) =>
            String(ev.subscriptionId) === String(sub._id) &&
            ev.type === 'chargeback_shield' &&
            ev.sentAt >= cycleStart
        );
        const alreadySent = eventsForSub.length > 0;

        if (!alreadySent) {
          const dedupKey = `${String(sub._id)}:chargeback_shield`;
          const inMemoryAlreadySent = eventIndex.has(dedupKey);

          if (!inMemoryAlreadySent) {
            try {
              const result = await sendChargebackShieldEmail({
                to: sub.customerEmail,
                customerName: sub.customerName,
                mrrCents: sub.mrr,
                billingDate: sub.currentPeriodEnd,
              });

              emailCreateOps.push({
                orgId: sub.orgId,
                subscriptionId: sub._id,
                stripeCustomerId: sub.stripeCustomerId,
                type: 'chargeback_shield',
                resendMessageId: result?.id ?? null,
                sentAt: now,
              });

              eventIndex.set(dedupKey, now);
              chargebackShieldSent++;
            } catch (err) {
              console.error(`[cron/prevention] chargeback shield failed sub=${sub.stripeSubscriptionId}:`, err.message);
            }
          }
        }
      }
    }

    // ── 5. Bulk insert all EmailEvent records in one operation ────────────────
    if (emailCreateOps.length > 0) {
      await EmailEvent.insertMany(emailCreateOps, { ordered: false });
    }

    console.log(
      `[cron/prevention] accounts=${connections.length} subs=${subscriptions.length} expiry=${expiryEmailsSent} chargeback_shield=${chargebackShieldSent}`
    );

    return NextResponse.json({
      accounts: connections.length,
      expiryEmailsSent,
      chargebackShieldSent,
    });

  } catch (error) {
    console.error('[cron/prevention]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function daysUntilCardExpiry(expMonth, expYear, now) {
  const expiry = new Date(expYear, expMonth, 0, 23, 59, 59);
  return Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sendExpiryEmail({ to, customerName, cardBrand, cardLast4, daysUntilExpiry, type }) {
  const name = customerName || 'there';
  const card = cardBrand && cardLast4 ? `${cardBrand} card ending in ${cardLast4}` : 'your card';

  const urgencyMap = {
    expiry_j7: `in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'} — action required`,
    expiry_j14: `in ${daysUntilExpiry} days`,
    expiry_j30: `in ${daysUntilExpiry} days`,
  };
  const urgency = urgencyMap[type];

  const subject =
    type === 'expiry_j7'
      ? `Action required: your ${card} expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}`
      : `Reminder: your ${card} expires in ${daysUntilExpiry} days`;

  const html = `<p>Hi ${name},</p>
<p>Your ${card} used for your subscription will expire <strong>${urgency}</strong>.</p>
<p>Please update your payment method to avoid any interruption to your service.</p>
<p>Thanks,<br/>The team</p>`;

  return sendEmail({ to, subject, html, text: html.replace(/<[^>]+>/g, '') });
}

function sendChargebackShieldEmail({ to, customerName, mrrCents, billingDate }) {
  const name = customerName || 'there';
  const amount = mrrCents ? `$${(mrrCents / 100).toFixed(2)}` : 'your subscription';
  const date = billingDate.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const subject = `Your upcoming renewal on ${date}`;
  const html = `<p>Hi ${name},</p>
<p>Just a heads-up: your subscription renewal of <strong>${amount}</strong> is scheduled for <strong>${date}</strong>.</p>
<p>If you have any questions about this charge, feel free to reach out before the billing date.</p>
<p>Thanks,<br/>The team</p>`;

  return sendEmail({ to, subject, html, text: html.replace(/<[^>]+>/g, '') });
}

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

    const connections = await StripeConnection.find({ syncStatus: 'done' }).lean();

    let expiryEmailsSent = 0;
    let chargebackShieldSent = 0;

    for (const connection of connections) {
      const orgId = connection.userId;

      const subscriptions = await Subscription.find({
        orgId,
        status: { $in: ['active', 'trialing'] },
        customerEmail: { $exists: true, $ne: null },
        cardExpMonth: { $exists: true, $ne: null },
        cardExpYear: { $exists: true, $ne: null },
      }).lean();

      for (const sub of subscriptions) {
        const days = daysUntilCardExpiry(sub.cardExpMonth, sub.cardExpYear, now);

        // ── Expiry alerts ──────────────────────────────────────────────────────
        if (days >= 0 && days <= 30) {
          const emailType = days <= 7 ? 'expiry_j7' : days <= 14 ? 'expiry_j14' : 'expiry_j30';

          // Dedup: one per email type per subscription per calendar month
          const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
          const alreadySent = await EmailEvent.findOne({
            subscriptionId: sub._id,
            type: emailType,
            sentAt: { $gte: monthStart },
          }).lean();

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

              await EmailEvent.create({
                orgId,
                subscriptionId: sub._id,
                stripeCustomerId: sub.stripeCustomerId,
                type: emailType,
                resendMessageId: result?.id ?? null,
                sentAt: now,
              });

              expiryEmailsSent++;
            } catch (err) {
              console.error(`[cron/prevention] expiry email failed sub=${sub.stripeSubscriptionId}:`, err.message);
            }
          }
        }

        // ── Chargeback Shield ──────────────────────────────────────────────────
        // Customers with recoveryScore < 40 billing within 7 days → pre-debit notice
        const billingInWindow =
          sub.currentPeriodEnd &&
          sub.currentPeriodEnd > now &&
          sub.currentPeriodEnd <= addDays(now, 7);

        if (
          sub.recoveryScore !== null &&
          sub.recoveryScore < 40 &&
          billingInWindow
        ) {
          // Dedup: one per billing cycle (since currentPeriodStart)
          const cycleStart = sub.currentPeriodStart ?? new Date(now.getFullYear(), now.getMonth(), 1);
          const alreadySent = await EmailEvent.findOne({
            subscriptionId: sub._id,
            type: 'chargeback_shield',
            sentAt: { $gte: cycleStart },
          }).lean();

          if (!alreadySent) {
            try {
              const result = await sendChargebackShieldEmail({
                to: sub.customerEmail,
                customerName: sub.customerName,
                mrrCents: sub.mrr,
                billingDate: sub.currentPeriodEnd,
              });

              await EmailEvent.create({
                orgId,
                subscriptionId: sub._id,
                stripeCustomerId: sub.stripeCustomerId,
                type: 'chargeback_shield',
                resendMessageId: result?.id ?? null,
                sentAt: now,
              });

              chargebackShieldSent++;
            } catch (err) {
              console.error(`[cron/prevention] chargeback shield failed sub=${sub.stripeSubscriptionId}:`, err.message);
            }
          }
        }
      }
    }

    console.log(
      `[cron/prevention] accounts=${connections.length} expiry=${expiryEmailsSent} chargeback_shield=${chargebackShieldSent}`
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

/**
 * Returns days until the card expires (end of expiry month).
 * Returns negative if already expired.
 */
function daysUntilCardExpiry(expMonth, expYear, now) {
  // new Date(year, expMonth, 0) = last day of expMonth (JS month is 0-indexed, day 0 = prev month's last day)
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

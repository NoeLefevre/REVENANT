import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { sendEmail } from '@/libs/resend';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import User from '@/models/User';

/**
 * GET /api/cron/onboarding
 * Daily cron (09:00 UTC) — sends nurture emails to non-converters who saw their score.
 *
 * Email schedule (from the moment healthScore.computedAt):
 *   Step 0 (email 1): immediate — sent from sync/route.js, NOT here
 *   Step 1 (email 2): T+24h  — "You have X cards expiring in the next 30 days"
 *   Step 2 (email 3): T+72h  — "Your recovery rate is below average"
 *   Step 3 (email 4): T+7d   — "Your free score expires soon"
 *
 * Non-converter = syncStatus 'done' + User.hasAccess false
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // ── 1. Find all non-converter connections ─────────────────────────────────
    // A non-converter has syncStatus done and their user has hasAccess: false
    const connections = await StripeConnection.find({
      syncStatus: 'done',
      'healthScore.computedAt': { $exists: true },
    })
      .select('userId healthScore onboardingEmailsSent')
      .lean();

    if (connections.length === 0) {
      return NextResponse.json({ processed: 0, sent: 0 });
    }

    const userIds = connections.map((c) => c.userId);

    // Load users: only non-converters (hasAccess: false)
    const users = await User.find({
      _id: { $in: userIds },
      hasAccess: false,
      email: { $exists: true, $ne: null },
    })
      .select('_id email name')
      .lean();

    if (users.length === 0) {
      return NextResponse.json({ processed: connections.length, sent: 0 });
    }

    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    // ── 2. For each non-converter, determine which email to send ──────────────
    let sent = 0;
    const HOUR = 60 * 60 * 1000;

    // Load subscriptions for email 2 (card expiry count)
    const orgIds = users.map((u) => u._id);
    const expiringSubsByOrg = new Map();

    if (orgIds.length > 0) {
      const expiringSubs = await Subscription.find({
        orgId: { $in: orgIds },
        status: { $in: ['active', 'trialing'] },
        cardExpMonth: { $exists: true },
        cardExpYear: { $exists: true },
      })
        .select('orgId cardExpMonth cardExpYear')
        .lean();

      for (const sub of expiringSubs) {
        const expiry = new Date(sub.cardExpYear, sub.cardExpMonth, 0, 23, 59, 59);
        if (expiry <= in30Days) {
          const key = sub.orgId.toString();
          expiringSubsByOrg.set(key, (expiringSubsByOrg.get(key) ?? 0) + 1);
        }
      }
    }

    const connectionUpdates = [];

    for (const conn of connections) {
      const user = userById.get(conn.userId.toString());
      if (!user) continue; // has access or no email — skip

      const computedAt = new Date(conn.healthScore.computedAt);
      const elapsedMs = now.getTime() - computedAt.getTime();
      const sent24h = elapsedMs >= 24 * HOUR;
      const sent72h = elapsedMs >= 72 * HOUR;
      const sent7d  = elapsedMs >= 7 * 24 * HOUR;

      const emailsSent = new Set(conn.onboardingEmailsSent ?? []);
      const name = user.name || 'there';
      const score = conn.healthScore.total ?? 0;
      const recoveryRate = conn.healthScore.dimensions?.recoveryRate ?? 0;
      const expiringCount = expiringSubsByOrg.get(conn.userId.toString()) ?? 0;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL;

      let stepToSend = null;
      let subject = '';
      let html = '';

      // Email 4 (step 3): T+7d
      if (sent7d && !emailsSent.has(3)) {
        stepToSend = 3;
        subject = `Your free score expires soon`;
        html = `<p>Hi ${name},</p>
<p>Your Revenue Health Score data is now 7 days old. Things may have changed — new payment failures, cards expiring, or recovered invoices.</p>
<p>Reconnect your Stripe account to get an updated score — or activate REVENANT to protect your revenue automatically from today.</p>
<p><a href="${appUrl}/onboarding/score">Check your score again →</a></p>
<p>Thanks,<br/>The REVENANT team</p>`;

      // Email 3 (step 2): T+72h
      } else if (sent72h && !emailsSent.has(2)) {
        stepToSend = 2;
        // Industry benchmark: ~68% recovery rate
        const benchmark = 68;
        subject = `${name}, your recovery rate is${recoveryRate >= benchmark ? ' above' : ' below'} average`;
        html = `<p>Hi ${name},</p>
<p>SaaS products at your MRR typically recover <strong>${benchmark}%</strong> of failed payments. Your current recovery rate is <strong>${recoveryRate}%</strong>.</p>
<p>${recoveryRate < benchmark
  ? `That gap represents real revenue being left on the table. REVENANT's smart dunning sequences can close it — automatically.`
  : `You're doing well. REVENANT can keep that number high and protect you from future failures.`
}</p>
<p><a href="${appUrl}/onboarding/score">Start recovering more →</a></p>
<p>Thanks,<br/>The REVENANT team</p>`;

      // Email 2 (step 1): T+24h
      } else if (sent24h && !emailsSent.has(1)) {
        stepToSend = 1;
        if (expiringCount > 0) {
          subject = `You have ${expiringCount} card${expiringCount > 1 ? 's' : ''} expiring in the next 30 days`;
          html = `<p>Hi ${name},</p>
<p>We found <strong>${expiringCount} card${expiringCount > 1 ? 's' : ''}</strong> expiring within the next 30 days on active subscriptions.</p>
<p>Without action, those customers will hit payment failures — and you'll start losing MRR. REVENANT's expiry pre-dunning automatically contacts customers before their card expires.</p>
<p><a href="${appUrl}/onboarding/score">Activate protection →</a></p>
<p>Thanks,<br/>The REVENANT team</p>`;
        } else {
          subject = `Your Revenue Health Score: a quick reminder`;
          html = `<p>Hi ${name},</p>
<p>A quick reminder that your Revenue Health Score is <strong>${score}/100</strong> and your REVENANT protection is not yet activated.</p>
<p>Payment failures happen without warning. Activate REVENANT to detect and recover them automatically.</p>
<p><a href="${appUrl}/onboarding/score">Activate protection →</a></p>
<p>Thanks,<br/>The REVENANT team</p>`;
        }
      }

      if (stepToSend !== null) {
        try {
          await sendEmail({
            to: user.email,
            subject,
            html,
            text: html.replace(/<[^>]+>/g, ''),
          });

          connectionUpdates.push({
            _id: conn._id,
            step: stepToSend,
          });

          sent++;
        } catch (err) {
          console.error(
            `[cron/onboarding] email step=${stepToSend} failed for userId=${conn.userId}:`,
            err.message
          );
        }
      }
    }

    // ── 3. Persist sent step tracking ─────────────────────────────────────────
    await Promise.all(
      connectionUpdates.map(({ _id, step }) =>
        StripeConnection.findByIdAndUpdate(_id, {
          $addToSet: { onboardingEmailsSent: step },
        })
      )
    );

    console.log(
      `[cron/onboarding] connections=${connections.length} non_converters=${users.length} sent=${sent}`
    );

    return NextResponse.json({
      processed: users.length,
      sent,
    });

  } catch (error) {
    console.error('[cron/onboarding]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

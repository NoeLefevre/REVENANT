import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { syncStripeData } from '@/libs/stripeConnect';
import { sendEmail } from '@/libs/resend';
import StripeConnection from '@/models/StripeConnection';
import User from '@/models/User';

// Vercel Pro: allow up to 5 minutes for large Stripe account syncs
export const maxDuration = 300;

export async function POST(request) {
  try {
    // Internal-only endpoint — verify shared secret
    const internalSecret = request.headers.get('x-internal-secret');
    if (!process.env.INTERNAL_SECRET || internalSecret !== process.env.INTERNAL_SECRET) {
      // Never log the received value — could help brute-force attempts
      console.error('[stripe-connect/sync] Forbidden — invalid or missing x-internal-secret');
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    await connectMongo();

    const connection = await StripeConnection.findOne({ userId });

    if (!connection) {
      return NextResponse.json({ error: 'No Stripe connection found' }, { status: 404 });
    }

    // Mark as syncing before starting
    await StripeConnection.findByIdAndUpdate(connection._id, { syncStatus: 'syncing' });

    console.log('[stripe-connect/sync] Starting syncStripeData for userId:', userId);

    // Await synchronously — Vercel kills fire-and-forget promises when the response is sent
    let syncSucceeded = false;
    try {
      await syncStripeData(userId, connection.stripeAccountId, connection.accessToken);
      console.log('[stripe-connect/sync] syncStripeData completed for userId:', userId);
      syncSucceeded = true;
    } catch (err) {
      console.error('[stripe-connect/sync] syncStripeData failed:', err);
      await StripeConnection.findByIdAndUpdate(connection._id, {
        syncStatus: 'error',
        syncError: err.message,
      });
    }

    // Send onboarding Email 1 (score reveal) only on successful sync
    if (syncSucceeded) {
      try {
        // Guard: skip silently if Resend is not configured
        if (!process.env.RESEND_API_KEY) {
          console.error('[REVENANT:SYNC] ❌ RESEND_API_KEY not set — onboarding email 1 skipped');
        } else {
          const [updatedConnection, user] = await Promise.all([
            StripeConnection.findOne({ userId }).select('healthScore onboardingEmailsSent').lean(),
            User.findById(userId).select('email name').lean(),
          ]);

          const alreadySent = updatedConnection?.onboardingEmailsSent?.includes(0);

          if (user?.email && updatedConnection?.healthScore?.total != null && !alreadySent) {
            const score = updatedConnection.healthScore.total;
            const name = user.name || 'there';
            await sendEmail({
              to: user.email,
              subject: `Your Revenue Health Score is ready`,
              html: `<p>Hi ${name},</p>
<p>Your Revenue Health Score is <strong>${score}/100</strong>.</p>
<p>${score < 70
  ? 'Your revenue is at risk from payment failures. REVENANT can protect it automatically — activate your protection to start recovering.'
  : "Your revenue is in good shape. Let's keep it that way."
}</p>
<p><a href="${process.env.NEXT_PUBLIC_APP_URL}/onboarding/score">Activate protection →</a></p>
<p>Thanks,<br/>The REVENANT team</p>`,
              text: `Your Revenue Health Score: ${score}/100. Visit ${process.env.NEXT_PUBLIC_APP_URL}/onboarding/score to activate protection.`,
            });
            await StripeConnection.findByIdAndUpdate(connection._id, {
              $addToSet: { onboardingEmailsSent: 0 },
            });
            console.log('[REVENANT:SYNC] ✅ Onboarding email 1 sent', {
              to: user.email,
              score,
            });
          }
        }
      } catch (err) {
        // Non-fatal: email failure must not affect sync status or response
        console.error('[REVENANT:SYNC] ❌ Onboarding email 1 failed', {
          error: err.message,
          userId,
        });
      }
    }

    return NextResponse.json({ success: true, message: 'Sync complete' });
  } catch (error) {
    console.error('[stripe-connect/sync]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import TrialGuard from '@/models/TrialGuard';

/**
 * GET /api/cron/trial-guard
 * Daily cron (06:00 UTC) — marks pre-auth holds as expired.
 *
 * Stripe pre-auth holds expire silently after 7 days.
 * This job syncs the DB to reflect that reality so the dashboard
 * never shows stale 'hold_active' records.
 *
 * Conditions to mark expired:
 *   - status is 'hold_active'
 *   - AND (trial has ended OR pre-auth was created > 7 days ago)
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const result = await TrialGuard.updateMany(
      {
        status: 'hold_active',
        $or: [
          { trialEnd: { $lt: now } },
          { createdAt: { $lt: sevenDaysAgo } },
        ],
      },
      { status: 'expired' }
    );

    console.log(`[cron/trial-guard] expired=${result.modifiedCount}`);

    return NextResponse.json({ expired: result.modifiedCount });
  } catch (error) {
    console.error('[cron/trial-guard]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

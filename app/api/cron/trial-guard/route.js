import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import Subscription from '@/models/Subscription';

/**
 * GET /api/cron/trial-guard
 * Daily cron (06:00 UTC) — marks active holds as expired when holdExpiresAt has passed.
 *
 * Stripe pre-auth holds expire silently after 7 days.
 * This job syncs the DB to reflect that reality so the dashboard
 * never shows stale 'held' records.
 */
export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const now = new Date();

    const result = await Subscription.updateMany(
      {
        paymentIntentStatus: 'held',
        holdExpiresAt: { $lt: now },
      },
      { paymentIntentStatus: 'cancelled' }
    );

    console.log(`[TRIAL-GUARD:CRON] expired holds marked cancelled: ${result.modifiedCount}`);

    return NextResponse.json({ expired: result.modifiedCount });
  } catch (error) {
    console.error('[TRIAL-GUARD:CRON]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

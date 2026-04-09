import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import Subscription from '@/models/Subscription';

/**
 * GET /api/dashboard/trial-guard
 * Returns the 4 Trial Guard counters for the dashboard MVP (brief section 9).
 */
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const orgId = session.user.id;
    await connectMongo();

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      trialsProtectedThisMonth,
      badCardsBlocked,
      conversionsSucceeded,
      activeHolds,
    ] = await Promise.all([
      // 1. Total trials protected this month (Trial Guard was enabled)
      Subscription.countDocuments({
        orgId,
        trialGuardEnabled: true,
        createdAt: { $gte: startOfMonth },
      }),
      // 2. Bad cards blocked (holds that failed = card rejected or 3DS failed)
      Subscription.countDocuments({
        orgId,
        paymentIntentStatus: 'failed',
        createdAt: { $gte: startOfMonth },
      }),
      // 3. Successful conversions backed by Trial Guard (hold captured = real payment confirmed)
      Subscription.countDocuments({
        orgId,
        paymentIntentStatus: 'captured',
        createdAt: { $gte: startOfMonth },
      }),
      // 4. Active holds (trials currently in progress, hold placed and waiting)
      Subscription.countDocuments({
        orgId,
        paymentIntentStatus: 'held',
      }),
    ]);

    return NextResponse.json({
      trialsProtectedThisMonth,
      badCardsBlocked,
      conversionsSucceeded,
      activeHolds,
    });
  } catch (err) {
    console.error('[/api/dashboard/trial-guard]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

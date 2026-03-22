import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';

/**
 * GET /api/stripe-connect/status
 * Returns the current syncStatus of the user's Stripe connection.
 * Used by /onboarding/syncing to poll until sync is complete.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongo();

    const connection = await StripeConnection.findOne({ userId: session.user.id })
      .select('syncStatus syncError')
      .lean();

    if (!connection) {
      return NextResponse.json({ syncStatus: 'pending', syncError: null });
    }

    return NextResponse.json({
      syncStatus: connection.syncStatus,
      syncError: connection.syncError ?? null,
    });
  } catch (error) {
    console.error('[stripe-connect/status]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

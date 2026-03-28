import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import { syncStripeData } from '@/libs/stripeConnect';
import StripeConnection from '@/models/StripeConnection';

// Allow up to 5 minutes — same as the initial sync
export const maxDuration = 300;

/**
 * POST /api/stripe-connect/resync
 *
 * Re-runs the full sync for the authenticated user's connected Stripe account.
 * Useful after a bug fix to backfill missing invoices without disconnecting Stripe.
 * Protected by session auth — only the account owner can trigger it.
 */
export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;

  await connectMongo();

  const connection = await StripeConnection.findOne({ userId });

  if (!connection) {
    return NextResponse.json({ error: 'No Stripe account connected' }, { status: 404 });
  }

  if (connection.syncStatus === 'syncing') {
    return NextResponse.json({ error: 'Sync already in progress' }, { status: 409 });
  }

  await StripeConnection.findByIdAndUpdate(connection._id, { syncStatus: 'syncing' });

  console.log('[stripe-connect/resync] Starting for userId:', userId);

  try {
    await syncStripeData(userId, connection.stripeAccountId, connection.accessToken);
    console.log('[stripe-connect/resync] Completed for userId:', userId);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[stripe-connect/resync] Failed:', err.message);
    await StripeConnection.findByIdAndUpdate(connection._id, {
      syncStatus: 'error',
      syncError: err.message,
    });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

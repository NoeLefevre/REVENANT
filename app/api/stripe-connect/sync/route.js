import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { syncStripeData } from '@/libs/stripeConnect';
import StripeConnection from '@/models/StripeConnection';

export async function POST(request) {
  try {
    // Internal-only endpoint — verify shared secret
    const internalSecret = request.headers.get('x-internal-secret');
    if (!process.env.INTERNAL_SECRET || internalSecret !== process.env.INTERNAL_SECRET) {
      console.error('[stripe-connect/sync] Forbidden — bad or missing INTERNAL_SECRET. Received:', internalSecret);
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
    try {
      await syncStripeData(userId, connection.stripeAccountId, connection.accessToken);
      console.log('[stripe-connect/sync] syncStripeData completed for userId:', userId);
    } catch (err) {
      console.error('[stripe-connect/sync] syncStripeData failed:', err);
      await StripeConnection.findByIdAndUpdate(connection._id, {
        syncStatus: 'error',
        syncError: err.message,
      });
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

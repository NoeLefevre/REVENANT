import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';
import User from '@/models/User';
import DunningSequence from '@/models/DunningSequence';

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongo();

    const connection = await StripeConnection.findOne({ userId: session.user.id });

    if (!connection) {
      return NextResponse.json({ error: 'No Stripe account connected' }, { status: 404 });
    }

    // Revoke OAuth token on Stripe's side
    try {
      await stripe.oauth.deauthorize({
        client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
        stripe_user_id: connection.stripeAccountId,
      });
    } catch (revokeError) {
      // Log but don't fail — we still clean up locally even if Stripe revocation fails
      console.error('[stripe-connect/disconnect] Stripe revoke error:', revokeError.message);
    }

    // Stop all active dunning sequences so crons don't fire on orphaned invoices
    await DunningSequence.updateMany(
      { orgId: session.user.id, status: 'active' },
      { status: 'stopped', stoppedAt: new Date(), stoppedReason: 'disconnected' }
    );

    // Remove StripeConnection document
    await StripeConnection.deleteOne({ userId: session.user.id });

    // Reset stripeConnectionId on User
    await User.findByIdAndUpdate(session.user.id, {
      stripeConnectionId: null,
    });

    console.log('[REVENANT:DISCONNECT] Stripe account disconnected', {
      userId: session.user.id,
      stripeAccountId: connection.stripeAccountId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[stripe-connect/disconnect]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

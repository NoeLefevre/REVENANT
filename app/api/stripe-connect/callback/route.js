import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import { encrypt } from '@/libs/encryption';
import StripeConnection from '@/models/StripeConnection';
import User from '@/models/User';

// ShipFast Stripe client — used ONLY to exchange OAuth code (REVENANT billing account)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export async function GET(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/signin`);
    }

    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle user-denied OAuth
    if (error) {
      console.error('[stripe-connect/callback] OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?error=stripe_denied`
      );
    }

    // CSRF check: state must match the logged-in user's ID
    if (state !== session.user.id) {
      return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
    }

    if (!code) {
      return NextResponse.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    // Exchange authorization code for access token
    const response = await stripe.oauth.token({
      grant_type: 'authorization_code',
      code,
    });

    await connectMongo();

    // Save encrypted access token to StripeConnection (upsert in case of reconnect)
    const connection = await StripeConnection.findOneAndUpdate(
      { userId: session.user.id },
      {
        userId: session.user.id,
        stripeAccountId: response.stripe_user_id,
        accessToken: encrypt(response.access_token),
        livemode: response.livemode ?? false,
        syncStatus: 'pending',
        syncError: null,
        connectedAt: new Date(),
      },
      { upsert: true, new: true }
    );

    // Link connection back to User
    await User.findByIdAndUpdate(session.user.id, {
      stripeConnectionId: connection._id,
    });

    // Trigger background sync (fire-and-forget)
    fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/stripe-connect/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SECRET,
      },
      body: JSON.stringify({ userId: session.user.id }),
    }).catch((err) => console.error('[stripe-connect/callback] sync trigger failed:', err));

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/syncing`
    );
  } catch (error) {
    console.error('[stripe-connect/callback]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

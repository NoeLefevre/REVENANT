import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import { encrypt } from '@/libs/encryption';
import StripeConnection from '@/models/StripeConnection';
import User from '@/models/User';

export async function GET(request) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    // Handle user-denied OAuth early — before any auth check
    if (error) {
      console.error('[stripe-connect/callback] OAuth error:', error);
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/onboarding?error=stripe_denied`
      );
    }

    // CSRF check: read cookie directly from the request object (not `cookies()` from
    // next/headers) to avoid interference from NextAuth v5 calling cookies() internally
    // during session rotation, which can cause next/headers cookie store to return stale
    // data after auth() has already consumed it.
    const savedState = request.cookies.get('stripe_oauth_state')?.value;

    if (!savedState || !state || state !== savedState) {
      console.error('[stripe-connect/callback] CSRF state mismatch', {
        hasSavedState: !!savedState,
        hasState: !!state,
        match: savedState === state,
      });
      return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
    }

    // Auth check after CSRF — session must exist to complete the connection
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.redirect(`${process.env.NEXT_PUBLIC_APP_URL}/signin`);
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

    // Clear the CSRF state cookie and redirect
    const redirectResponse = NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/syncing`
    );
    redirectResponse.cookies.delete('stripe_oauth_state');
    return redirectResponse;

  } catch (error) {
    console.error('[stripe-connect/callback]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

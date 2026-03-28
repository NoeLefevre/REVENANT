import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import crypto from 'crypto';

// Force dynamic — this route generates a random CSRF token per request,
// must never be statically cached.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Generate a cryptographically random CSRF state token (not predictable like user ID)
    const state = crypto.randomBytes(32).toString('hex');

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
      scope: 'read_write',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe-connect/callback`,
      state,
    });

    const url = `https://connect.stripe.com/oauth/authorize?${params}`;

    const response = NextResponse.redirect(url);

    // Store state in a short-lived httpOnly cookie for verification in the callback
    response.cookies.set('stripe_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 10 * 60, // 10 minutes — enough for the OAuth flow
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('[stripe-connect/authorize]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

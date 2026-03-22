import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';

export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
      scope: 'read_write',
      redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/stripe-connect/callback`,
      state: session.user.id, // CSRF protection
    });

    const url = `https://connect.stripe.com/oauth/authorize?${params}`;

    return NextResponse.redirect(url);
  } catch (error) {
    console.error('[stripe-connect/authorize]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

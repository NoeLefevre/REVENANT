import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';

/**
 * PATCH /api/settings/trial-guard
 * Updates Trial Guard mode (universal/selective) for the current user.
 * Brief section 10: single toggle — Universal (default) or Selective.
 */
export async function PATCH(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { trialGuardMode } = body;

    if (trialGuardMode !== 'universal' && trialGuardMode !== 'selective') {
      return NextResponse.json(
        { error: 'trialGuardMode must be "universal" or "selective"' },
        { status: 400 }
      );
    }

    await connectMongo();

    await StripeConnection.updateOne(
      { userId: session.user.id },
      { $set: { trialGuardMode } }
    );

    return NextResponse.json({ success: true, trialGuardMode });
  } catch (error) {
    console.error('[PATCH /api/settings/trial-guard]', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';

/**
 * POST /api/settings/trial-guard
 * Saves Trial Guard settings (enabled toggle + radarThreshold) for the current user.
 */
export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { enabled, radarThreshold } = body;

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }
    if (
      typeof radarThreshold !== 'number' ||
      radarThreshold < 0 ||
      radarThreshold > 100 ||
      !Number.isInteger(radarThreshold)
    ) {
      return NextResponse.json(
        { error: 'radarThreshold must be an integer between 0 and 100' },
        { status: 400 }
      );
    }

    await connectMongo();

    await StripeConnection.updateOne(
      { userId: session.user.id },
      {
        $set: {
          'settings.trialGuard.enabled':        enabled,
          'settings.trialGuard.radarThreshold': radarThreshold,
        },
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[settings/trial-guard]', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

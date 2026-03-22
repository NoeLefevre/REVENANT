import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import User from '@/models/User';

const VALID_MRR_BANDS = ['under_30k', '30k_80k', 'over_80k'];

/**
 * POST /api/onboarding/mrr-band
 * Saves the user's self-reported MRR band.
 * Used at onboarding step 3 to assign the correct Stripe price tier.
 */
export async function POST(request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { mrrBand } = await request.json();

    if (!mrrBand || !VALID_MRR_BANDS.includes(mrrBand)) {
      return NextResponse.json(
        { error: 'Invalid mrrBand. Must be one of: under_30k, 30k_80k, over_80k' },
        { status: 400 }
      );
    }

    await connectMongo();

    await User.findByIdAndUpdate(session.user.id, { mrrBand });

    return NextResponse.json({ success: true, mrrBand });
  } catch (error) {
    console.error('[onboarding/mrr-band]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import User from '@/models/User';
import { createCheckout } from '@/libs/stripe';
import configFile from '@/config';

const MRR_BAND_TO_PLAN_INDEX = {
  under_30k: 0,
  '30k_80k': 1,
  over_80k: 2,
};

const VALID_MRR_BANDS = Object.keys(MRR_BAND_TO_PLAN_INDEX);

/**
 * POST /api/onboarding/mrr-band
 * Saves the user's self-reported MRR band and returns a Stripe Checkout URL.
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

    const user = await User.findByIdAndUpdate(
      session.user.id,
      { mrrBand },
      { new: true }
    );

    const planIndex = MRR_BAND_TO_PLAN_INDEX[mrrBand];
    const plan = configFile.stripe.plans[planIndex];

    if (!plan?.priceId || plan.priceId.startsWith('price_dev_') || !plan.priceId.startsWith('price_')) {
      console.error(`[onboarding/mrr-band] Invalid priceId for band "${mrrBand}": "${plan?.priceId}". Check STRIPE_PRICE_* env vars.`);
      return NextResponse.json(
        { error: 'Stripe price not configured for this plan. Contact support.' },
        { status: 500 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL;

    const checkoutUrl = await createCheckout({
      priceId: plan.priceId,
      mode: 'subscription',
      successUrl: `${appUrl}/overview?payment=success`,
      cancelUrl: `${appUrl}/onboarding/done?payment=cancelled`,
      clientReferenceId: user._id.toString(),
      user,
    });

    return NextResponse.json({ checkoutUrl });
  } catch (error) {
    console.error('[onboarding/mrr-band]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

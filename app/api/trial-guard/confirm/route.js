import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { getClientStripe } from '@/libs/stripeConnect';
import Subscription from '@/models/Subscription';
import StripeConnection from '@/models/StripeConnection';

/**
 * GET /api/trial-guard/confirm?payment_intent=xxx
 *
 * Callback after 3DS authentication (brief section 5).
 * Stripe redirects here after the customer completes (or fails) 3DS.
 *
 * Outcomes:
 *   - requires_capture → 3DS succeeded, hold is active → grant trial
 *   - any other status → 3DS failed → cancel subscription, block trial
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const paymentIntentId = searchParams.get('payment_intent');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? '';

  if (!paymentIntentId) {
    console.error('[TRIAL-GUARD:CONFIRM] Missing payment_intent param');
    return NextResponse.redirect(`${appUrl}/trial-guard/error`);
  }

  try {
    await connectMongo();

    // 1. Find the subscription linked to this PaymentIntent
    const subscription = await Subscription.findOne({ paymentIntentId }).lean();
    if (!subscription) {
      console.error('[TRIAL-GUARD:CONFIRM] No subscription found for PaymentIntent', { paymentIntentId });
      return NextResponse.redirect(`${appUrl}/trial-guard/error`);
    }

    // 2. Get the StripeConnection to call the right connected account
    const connection = await StripeConnection.findOne({ userId: subscription.orgId }).lean();
    if (!connection) {
      console.error('[TRIAL-GUARD:CONFIRM] No StripeConnection found', { orgId: subscription.orgId });
      return NextResponse.redirect(`${appUrl}/trial-guard/error`);
    }

    const clientStripe = getClientStripe(connection.accessToken);

    // 3. Retrieve PaymentIntent from Stripe to get the authoritative status
    const pi = await clientStripe.paymentIntents.retrieve(
      paymentIntentId,
      {},
      { stripeAccount: connection.stripeAccountId }
    );

    if (pi.status === 'requires_capture') {
      // 3DS succeeded — hold is active
      await Subscription.findOneAndUpdate(
        { paymentIntentId },
        { paymentIntentStatus: 'held' }
      );
      console.log('[TRIAL-GUARD:CONFIRM] 3DS succeeded — hold active', {
        paymentIntentId,
        subscriptionId: subscription.stripeSubscriptionId,
      });
      return NextResponse.redirect(`${appUrl}/trial-guard/success`);
    }

    // 3DS failed or cancelled — block the trial (brief section 5 + 6)
    await Subscription.findOneAndUpdate(
      { paymentIntentId },
      { paymentIntentStatus: 'failed' }
    );

    // Cancel the Stripe subscription to block trial access (brief section 6)
    try {
      await clientStripe.subscriptions.cancel(
        subscription.stripeSubscriptionId,
        {},
        { stripeAccount: connection.stripeAccountId }
      );
      console.log('[TRIAL-GUARD:CONFIRM] Subscription cancelled after 3DS failure', {
        subscriptionId: subscription.stripeSubscriptionId,
        paymentIntentStatus: pi.status,
      });
    } catch (cancelErr) {
      console.error('[TRIAL-GUARD:CONFIRM] Failed to cancel subscription', {
        subscriptionId: subscription.stripeSubscriptionId,
        error: cancelErr.message,
      });
    }

    return NextResponse.redirect(`${appUrl}/trial-guard/blocked`);
  } catch (err) {
    console.error('[TRIAL-GUARD:CONFIRM] Unexpected error', { error: err.message });
    return NextResponse.redirect(`${appUrl}/trial-guard/error`);
  }
}

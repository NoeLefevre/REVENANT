import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';
import User from '@/models/User';
import Invoice from '@/models/Invoice';
import Subscription from '@/models/Subscription';
import DunningSequence from '@/models/DunningSequence';
import EmailEvent from '@/models/EmailEvent';

export async function POST() {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongo();

    const orgId = session.user.id;
    const connection = await StripeConnection.findOne({ userId: orgId });

    // Already disconnected — idempotent
    if (!connection) {
      return NextResponse.json({ success: true, deleted: { invoices: 0, subscriptions: 0, emailEvents: 0, sequences: 0 } });
    }

    const { stripeAccountId } = connection;

    // 1. Stop all active dunning sequences so crons don't fire on orphaned invoices
    const sequenceResult = await DunningSequence.updateMany(
      { orgId, status: 'active' },
      { status: 'stopped', stoppedAt: new Date(), stoppedReason: 'stripe_disconnected' }
    );

    // 2. Delete all data tied to this org
    const [invoiceResult, subResult, emailResult, dunningDeleteResult] = await Promise.all([
      Invoice.deleteMany({ orgId }),
      Subscription.deleteMany({ orgId }),
      EmailEvent.deleteMany({ orgId }),
      DunningSequence.deleteMany({ orgId }),
    ]);

    // 3. Revoke OAuth token on Stripe's side (non-blocking)
    try {
      await stripe.oauth.deauthorize({
        client_id: process.env.STRIPE_CONNECT_CLIENT_ID,
        stripe_user_id: stripeAccountId,
      });
    } catch (revokeError) {
      // Log but don't fail — clean up locally even if Stripe revocation fails
      // (token may already be expired or revoked by the user in Stripe dashboard)
      console.warn('[REVENANT:DISCONNECT] OAuth revoke failed', {
        stripeAccountId,
        error: revokeError.message,
      });
    }

    // 4. Delete the StripeConnection document
    await StripeConnection.deleteOne({ userId: orgId });

    // 5. Reset stripeConnectionId on User
    await User.findByIdAndUpdate(orgId, { stripeConnectionId: null });

    console.log('[REVENANT:DISCONNECT] ✅ Full disconnect complete', {
      userId: orgId,
      stripeAccountId,
      deletedInvoices: invoiceResult.deletedCount,
      deletedSubscriptions: subResult.deletedCount,
      deletedEmailEvents: emailResult.deletedCount,
      deletedSequences: dunningDeleteResult.deletedCount,
      stoppedActiveSequences: sequenceResult.modifiedCount,
    });

    return NextResponse.json({
      success: true,
      deleted: {
        invoices: invoiceResult.deletedCount,
        subscriptions: subResult.deletedCount,
        emailEvents: emailResult.deletedCount,
        sequences: dunningDeleteResult.deletedCount,
      },
    });
  } catch (error) {
    console.error('[stripe-connect/disconnect]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.statusCode || 500 }
    );
  }
}

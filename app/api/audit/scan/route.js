import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import Invoice from '@/models/Invoice';
import Subscription from '@/models/Subscription';
import StripeConnection from '@/models/StripeConnection';

/**
 * GET /api/audit/scan
 * Returns a real-time revenue health snapshot from synced MongoDB data.
 * Requires auth + a connected Stripe account with syncStatus='done'.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongo();

    const orgId = session.user.id;

    // Verify connected Stripe account
    const connection = await StripeConnection.findOne({ userId: orgId, syncStatus: 'done' })
      .select('_id')
      .lean();

    if (!connection) {
      return NextResponse.json({ error: 'No connected Stripe account' }, { status: 404 });
    }

    const now = new Date();

    // ── Failed payments + at-risk revenue ──────────────────────────────────────
    // Mongoose coerces orgId string → ObjectId automatically
    const openInvoices = await Invoice.find({ orgId, status: 'open' })
      .select('amount')
      .lean();

    const failedPayments = openInvoices.length;
    const atRisk = openInvoices.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);

    // ── Cards expiring within 30 days + Chargeback Shield ─────────────────────
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const activeSubs = await Subscription.find({
      orgId,
      status: { $in: ['active', 'trialing'] },
      cardExpMonth: { $exists: true, $ne: null },
      cardExpYear: { $exists: true, $ne: null },
    })
      .select('cardExpMonth cardExpYear recoveryScore currentPeriodEnd')
      .lean();

    let cardsExpiring = 0;
    let chargebackRisk = 0;

    for (const sub of activeSubs) {
      // Last day of card expiry month
      // new Date(year, expMonth, 0) = last day of expMonth (expMonth is 1-indexed; JS day=0 → prev month's last day)
      const cardExpiry = new Date(sub.cardExpYear, sub.cardExpMonth, 0, 23, 59, 59);
      const daysLeft = Math.floor((cardExpiry - now) / (1000 * 60 * 60 * 24));

      if (daysLeft >= 0 && daysLeft <= 30) {
        cardsExpiring++;
      }

      if (
        sub.recoveryScore !== null &&
        sub.recoveryScore < 40 &&
        sub.currentPeriodEnd &&
        sub.currentPeriodEnd > now &&
        sub.currentPeriodEnd <= in7Days
      ) {
        chargebackRisk++;
      }
    }

    return NextResponse.json({ atRisk, failedPayments, cardsExpiring, chargebackRisk });

  } catch (error) {
    console.error('[audit/scan]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

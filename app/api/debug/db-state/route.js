import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';
import DunningSequence from '@/models/DunningSequence';
import User from '@/models/User';

/**
 * GET /api/debug/db-state
 * Protected by x-internal header (value = INTERNAL_SECRET env var).
 * Pass ?userId= to filter by a specific user. Without it, returns aggregate counts.
 *
 * Remove this route once debugging is complete.
 */
export async function GET(request) {
  const secret = request.headers.get('x-internal');
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await connectMongo();

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId'); // optional — filter by org

  const orgFilter = userId ? { orgId: userId } : {};
  const connFilter = userId ? { userId } : {};

  // ── Stripe Connection ────────────────────────────────────────────────────────
  const connection = await StripeConnection.findOne(connFilter)
    .select('userId stripeAccountId syncStatus lastSyncAt syncError healthScore livemode')
    .lean();

  // ── Counts ───────────────────────────────────────────────────────────────────
  const [invoiceCount, subCount, dunningCount] = await Promise.all([
    Invoice.countDocuments(orgFilter),
    Subscription.countDocuments(orgFilter),
    DunningSequence.countDocuments(orgFilter),
  ]);

  // ── Breakdown by status ──────────────────────────────────────────────────────
  const [invoiceStatusGroups, subStatusGroups, dieCategoryGroups] = await Promise.all([
    Invoice.aggregate([
      { $match: orgFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Subscription.aggregate([
      { $match: orgFilter },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: orgFilter },
      { $group: { _id: '$dieCategory', count: { $sum: 1 } } },
    ]),
  ]);

  const invoicesByStatus = Object.fromEntries(
    invoiceStatusGroups.map((g) => [g._id ?? 'null', g.count])
  );
  const subscriptionsByStatus = Object.fromEntries(
    subStatusGroups.map((g) => [g._id ?? 'null', g.count])
  );
  const invoicesByDieCategory = Object.fromEntries(
    dieCategoryGroups.map((g) => [g._id ?? 'null', g.count])
  );

  // ── Sample documents ─────────────────────────────────────────────────────────
  const [sampleInvoices, sampleSubscriptions] = await Promise.all([
    Invoice.find(orgFilter).sort({ createdAt: -1 }).limit(3).lean(),
    Subscription.find(orgFilter).sort({ createdAt: -1 }).limit(3).lean(),
  ]);

  // ── User record (if userId provided) ────────────────────────────────────────
  let userRecord = null;
  if (userId) {
    userRecord = await User.findById(userId)
      .select('email name hasAccess stripeConnectionId')
      .lean();
  }

  return NextResponse.json({
    stripeConnection: connection
      ? {
          userId: connection.userId?.toString(),
          stripeAccountId: connection.stripeAccountId,
          syncStatus: connection.syncStatus,
          lastSyncAt: connection.lastSyncAt ?? null,
          syncError: connection.syncError ?? null,
          livemode: connection.livemode,
          healthScore: connection.healthScore
            ? {
                total: connection.healthScore.total,
                dimensions: connection.healthScore.dimensions,
                computedAt: connection.healthScore.computedAt,
              }
            : null,
        }
      : null,
    user: userRecord
      ? {
          _id: userRecord._id?.toString(),
          email: userRecord.email,
          hasAccess: userRecord.hasAccess,
          stripeConnectionId: userRecord.stripeConnectionId?.toString() ?? null,
        }
      : null,
    counts: {
      invoices: invoiceCount,
      subscriptions: subCount,
      dunningSequences: dunningCount,
    },
    invoicesByStatus,
    invoicesByDieCategory,
    subscriptionsByStatus,
    sampleInvoices: sampleInvoices.map((inv) => ({
      ...inv,
      _id: inv._id?.toString(),
      orgId: inv.orgId?.toString(),
    })),
    sampleSubscriptions: sampleSubscriptions.map((sub) => ({
      ...sub,
      _id: sub._id?.toString(),
      orgId: sub.orgId?.toString(),
    })),
  });
}

import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';
import DunningSequence from '@/models/DunningSequence';

/**
 * GET /api/debug/db-state
 *
 * Returns a snapshot of the authenticated user's REVENANT data for debugging.
 * Protected by session auth — only shows data for the currently logged-in user.
 * Remove this route once debugging is complete.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const orgId = session.user.id;

  await connectMongo();

  const [connection, invoiceCounts, invoicesByStatus, invoicesByCategory, subCounts, subsByStatus, recentInvoices, activeDunning] = await Promise.all([
    // StripeConnection
    StripeConnection.findOne({ userId: orgId })
      .select('stripeAccountId syncStatus lastSyncAt healthScore livemode')
      .lean(),

    // Invoice totals
    Invoice.countDocuments({ orgId }),
    Invoice.aggregate([
      { $match: { orgId: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Invoice.aggregate([
      { $match: { orgId: orgId, dieCategory: { $ne: null } } },
      { $group: { _id: '$dieCategory', count: { $sum: 1 } } },
    ]),

    // Subscription totals
    Subscription.countDocuments({ orgId }),
    Subscription.aggregate([
      { $match: { orgId: orgId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),

    // Last 5 invoices
    Invoice.find({ orgId })
      .sort({ createdAt: -1 })
      .limit(5)
      .select('stripeInvoiceId status dieCategory failureCode amount currency failedAt recoveredAt recoveryScore')
      .lean(),

    // Active dunning sequences
    DunningSequence.find({ orgId, status: 'active' })
      .limit(5)
      .select('category currentStep status steps createdAt')
      .lean(),
  ]);

  return NextResponse.json({
    connection: connection
      ? {
          stripeAccountId: connection.stripeAccountId,
          syncStatus: connection.syncStatus,
          lastSyncAt: connection.lastSyncAt,
          livemode: connection.livemode,
          healthScore: connection.healthScore ?? null,
        }
      : null,
    invoices: {
      total: invoiceCounts,
      byStatus: Object.fromEntries(invoicesByStatus.map((r) => [r._id, r.count])),
      byDieCategory: Object.fromEntries(invoicesByCategory.map((r) => [r._id, r.count])),
      recent: recentInvoices,
    },
    subscriptions: {
      total: subCounts,
      byStatus: Object.fromEntries(subsByStatus.map((r) => [r._id, r.count])),
    },
    dunning: {
      activeSequences: activeDunning,
    },
  });
}

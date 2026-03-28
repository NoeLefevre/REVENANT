import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';
import DunningSequence from '@/models/DunningSequence';

/**
 * GET /api/debug/db-state
 * Protected by x-internal-secret header.
 * Remove this route once debugging is complete.
 */
export async function GET(request) {
  const secret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await connectMongo();

  // Accept ?userId= to target a specific org, otherwise return aggregate counts
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');

  const orgFilter = userId ? { orgId: userId } : {};
  const connFilter = userId ? { userId } : {};

  const [connection, invoiceCount, subCount, dunningCount, sampleInvoice, sampleSub] =
    await Promise.all([
      StripeConnection.findOne(connFilter)
        .select('userId stripeAccountId syncStatus lastSyncAt syncError healthScore livemode')
        .lean(),
      Invoice.countDocuments(orgFilter),
      Subscription.countDocuments(orgFilter),
      DunningSequence.countDocuments(orgFilter),
      Invoice.findOne(orgFilter).sort({ createdAt: -1 }).lean(),
      Subscription.findOne(orgFilter).sort({ createdAt: -1 }).lean(),
    ]);

  return NextResponse.json({
    stripeConnection: connection
      ? {
          userId: connection.userId,
          stripeAccountId: connection.stripeAccountId,
          syncStatus: connection.syncStatus,
          lastSyncAt: connection.lastSyncAt ?? null,
          syncError: connection.syncError ?? null,
          healthScore: connection.healthScore ?? null,
          livemode: connection.livemode,
        }
      : null,
    counts: {
      invoices: invoiceCount,
      subscriptions: subCount,
      dunningSequences: dunningCount,
    },
    sampleInvoice: sampleInvoice ?? null,
    sampleSubscription: sampleSub ?? null,
  });
}

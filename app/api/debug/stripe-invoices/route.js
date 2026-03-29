import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { getClientStripe } from '@/libs/stripeConnect';
import StripeConnection from '@/models/StripeConnection';

/**
 * GET /api/debug/stripe-invoices?userId=xxx
 *
 * Calls stripe.invoices.list() with NO filters using the connected account token.
 * Confirms which Stripe client is used and what invoices actually exist.
 * Protected by x-internal-secret. Remove once debugging is complete.
 */
export async function GET(request) {
  const secret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('userId');
  if (!userId) {
    return NextResponse.json({ error: 'Missing ?userId=' }, { status: 400 });
  }

  await connectMongo();

  const connection = await StripeConnection.findOne({ userId }).lean();
  if (!connection) {
    return NextResponse.json({ error: 'No StripeConnection found for this userId' }, { status: 404 });
  }

  // Use the connected account's decrypted token — never STRIPE_SECRET_KEY
  const clientStripe = getClientStripe(connection.accessToken);

  // ── Pass 1: no filters at all — see everything ──────────────────────────────
  const allInvoices = await clientStripe.invoices.list({ limit: 10 });

  // ── Pass 2: same query with the 90-day window the sync uses ─────────────────
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;
  const invoices90d = await clientStripe.invoices.list({
    limit: 10,
    created: { gte: since },
  });

  // ── Pass 3: what the sync currently queries (status: open) ──────────────────
  const invoicesOpen = await clientStripe.invoices.list({
    limit: 10,
    status: 'open',
    created: { gte: since },
  });

  // ── Pass 4: paid in 90d ──────────────────────────────────────────────────────
  const invoicesPaid = await clientStripe.invoices.list({
    limit: 10,
    status: 'paid',
    created: { gte: since },
  });

  const shape = (list) =>
    list.data.map((inv) => ({
      id: inv.id,
      status: inv.status,
      amount_due: inv.amount_due,
      attempt_count: inv.attempt_count,
      created: new Date(inv.created * 1000).toISOString(),
      last_payment_error: inv.last_payment_error?.code ?? null,
    }));

  return NextResponse.json({
    clientUsed: 'connected_account',
    stripeAccountId: connection.stripeAccountId,
    sinceDate: new Date(since * 1000).toISOString(),
    noFilter: {
      total: allInvoices.data.length,
      hasMore: allInvoices.has_more,
      invoices: shape(allInvoices),
    },
    last90dNoStatusFilter: {
      total: invoices90d.data.length,
      hasMore: invoices90d.has_more,
      invoices: shape(invoices90d),
    },
    last90dStatusOpen: {
      total: invoicesOpen.data.length,
      invoices: shape(invoicesOpen),
    },
    last90dStatusPaid: {
      total: invoicesPaid.data.length,
      invoices: shape(invoicesPaid),
    },
  });
}

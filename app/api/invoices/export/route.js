import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import Invoice from '@/models/Invoice';

/**
 * GET /api/invoices/export
 * Streams all invoices for the authenticated user as a CSV download.
 */
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectMongo();

    const orgId = session.user.id;

    const invoices = await Invoice.find({ orgId })
      .sort({ createdAt: -1 })
      .lean();

    const headers = [
      'Invoice ID',
      'Customer Name',
      'Customer Email',
      'Amount',
      'Currency',
      'Status',
      'DIE Category',
      'Failure Code',
      'Recovery Score',
      'Retry Count',
      'Next Retry',
      'Failed At',
      'Recovered At',
    ];

    function escapeCSV(value: unknown): string {
      if (value === null || value === undefined) return '';
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    function formatDate(date: Date | undefined | null): string {
      if (!date) return '';
      return new Date(date).toISOString().split('T')[0];
    }

    const rows = invoices.map((inv) => [
      inv.stripeInvoiceId,
      inv.customerName ?? '',
      inv.customerEmail ?? '',
      inv.amount != null ? (inv.amount / 100).toFixed(2) : '',
      inv.currency ?? 'usd',
      inv.status ?? '',
      inv.dieCategory ?? '',
      inv.failureCode ?? '',
      inv.recoveryScore != null ? String(inv.recoveryScore) : '',
      inv.retryCount != null ? String(inv.retryCount) : '0',
      formatDate(inv.nextRetryAt),
      formatDate(inv.failedAt),
      formatDate(inv.recoveredAt),
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(escapeCSV).join(','))
      .join('\n');

    const date = new Date().toISOString().split('T')[0];

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="revenant-invoices-${date}.csv"`,
      },
    });

  } catch (error) {
    console.error('[invoices/export]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

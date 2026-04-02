import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import InvoiceModel from '@/models/Invoice';
import StripeConnectionModel from '@/models/StripeConnection';
import DIEBadge from '@/components/revenant/DIEBadge';
import RecoveryScore from '@/components/revenant/RecoveryScore';
import { getStripeInvoiceUrl } from '@/libs/stripeUrls';
import { Invoice, InvoiceStatus } from '@/types/revenant';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    page?: string;
    category?: string;
    status?: string;
  }>;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function docToInvoice(doc: any): Invoice {
  return {
    _id: doc._id?.toString() ?? '',
    orgId: doc.orgId?.toString() ?? '',
    stripeInvoiceId: doc.stripeInvoiceId ?? '',
    stripeSubscriptionId: doc.stripeSubscriptionId,
    stripeCustomerId: doc.stripeCustomerId ?? '',
    customerEmail: doc.customerEmail,
    customerName: doc.customerName,
    amount: doc.amount ?? 0,
    currency: doc.currency ?? 'usd',
    status: doc.status ?? 'open',
    dieCategory: doc.dieCategory,
    failureCode: doc.failureCode,
    failureMessage: doc.failureMessage,
    failedAt: doc.failedAt?.toISOString(),
    recoveredAt: doc.recoveredAt?.toISOString(),
    retryCount: doc.retryCount ?? 0,
    nextRetryAt: doc.nextRetryAt?.toISOString(),
    nextRetrySource: doc.nextRetrySource,
    recoveryScore: doc.recoveryScore,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

const categoryFilters: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'Temporary', value: 'SOFT_TEMPORARY' },
  { label: 'Card update', value: 'SOFT_UPDATABLE' },
  { label: 'Permanent', value: 'HARD_PERMANENT' },
];

const statusFilters: Array<{ label: string; value: string }> = [
  { label: 'All', value: '' },
  { label: 'In recovery', value: 'open' },
  { label: 'Recovered', value: 'recovered' },
  { label: 'Void', value: 'void' },
];

function StatusBadge({ status }: { status: InvoiceStatus | string }) {
  if (status === 'open') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#DBEAFE] text-[#1D4ED8]">
        In recovery
      </span>
    );
  }
  if (status === 'recovered') {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#DCFCE7] text-[#15803D]">
        Recovered
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#F3F4F6] text-[#6B7280]">
      {status}
    </span>
  );
}

export default async function InvoicesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const category = params.category ?? '';
  const statusFilter = params.status ?? '';

  // session.user.id is the User._id (ObjectId as string) — matches orgId in all models
  const orgId = session.user.id;

  let invoices: Invoice[] = [];
  let total = 0;
  let livemode = false;
  let error: string | null = null;

  try {
    await connectMongo();

    const query: Record<string, any> = { orgId };
    if (statusFilter) query.status = statusFilter;
    if (category) query.dieCategory = category;

    const [connection, count, raw] = await Promise.all([
      (StripeConnectionModel as any).findOne({ userId: orgId }).select('livemode').lean(),
      (InvoiceModel as any).countDocuments(query),
      (InvoiceModel as any)
        .find(query)
        .sort({ recoveryScore: -1, createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean(),
    ]);

    livemode = connection?.livemode ?? false;
    total = count;
    invoices = raw.map(docToInvoice);
  } catch (err) {
    console.error('[InvoicesPage] Error:', err);
    error = 'Failed to load invoices. Please try again.';
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-bold text-[#1A1A1A]">Failed Invoices</h1>
        <a
          href="/api/invoices/export"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[#4B5563] border border-[#E5E7EB] bg-white hover:bg-[#F7F5F2] transition-colors"
        >
          Export CSV
        </a>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col gap-2">
        {/* Status filters */}
        <div className="flex items-center gap-2">
          {statusFilters.map((f) => {
            const isActive = statusFilter === f.value;
            return (
              <a
                key={f.value}
                href={`/invoices?status=${f.value}&category=${category}`}
                className="px-3 py-1 rounded-lg text-sm font-medium border transition-colors"
                style={{
                  backgroundColor: isActive ? '#1A1A1A' : 'white',
                  color: isActive ? 'white' : '#4B5563',
                  borderColor: isActive ? '#1A1A1A' : '#E5E7EB',
                }}
              >
                {f.label}
              </a>
            );
          })}
          <span className="text-[#E5E7EB] mx-1">|</span>
          {/* Category filters */}
          {categoryFilters.map((f) => {
            const isActive = category === f.value;
            return (
              <a
                key={f.value}
                href={`/invoices?category=${f.value}&status=${statusFilter}`}
                className="px-3 py-1 rounded-lg text-sm font-medium border transition-colors"
                style={{
                  backgroundColor: isActive ? '#EDE9FE' : 'white',
                  color: isActive ? '#6C63FF' : '#4B5563',
                  borderColor: isActive ? '#6C63FF' : '#E5E7EB',
                }}
              >
                {f.label}
              </a>
            );
          })}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-4 text-[#DC2626] text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        {/* Table header */}
        <div
          className="grid items-center px-4 h-9"
          style={{
            backgroundColor: '#F7F5F2',
            borderBottom: '1px solid #E5E7EB',
            gridTemplateColumns: '1fr 6rem 7rem 5rem 7rem 6rem 6rem 2.5rem',
          }}
        >
          {['CUSTOMER', 'AMOUNT', 'CATEGORY', 'SCORE', 'SEQUENCE', 'NEXT RETRY', 'STATUS', ''].map(
            (col) => (
              <span
                key={col}
                className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]"
              >
                {col}
              </span>
            )
          )}
        </div>

        {/* Rows */}
        {invoices.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-[#9CA3AF]">
            No invoices found
          </div>
        ) : (
          invoices.map((invoice) => {
            const isHighlighted = invoice.dieCategory === 'SOFT_TEMPORARY';
            const displayName = invoice.customerName || invoice.customerEmail || invoice.stripeCustomerId;

            return (
              <div
                key={invoice._id}
                className="grid items-center px-4 h-14 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] transition-colors"
                style={{
                  gridTemplateColumns: '1fr 6rem 7rem 5rem 7rem 6rem 6rem 2.5rem',
                  backgroundColor: isHighlighted ? '#F5F3FF' : undefined,
                  borderLeft: isHighlighted ? '2px solid #6C63FF' : undefined,
                }}
              >
                {/* Customer */}
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{displayName}</span>
                  {invoice.customerName && invoice.customerEmail && (
                    <span className="text-[11px] text-[#9CA3AF] truncate">{invoice.customerEmail}</span>
                  )}
                </div>

                {/* Amount */}
                <span className="text-[13px] font-semibold text-[#1A1A1A]">
                  {formatCurrency(invoice.amount)}
                </span>

                {/* Category */}
                <div>
                  {invoice.dieCategory ? (
                    <DIEBadge category={invoice.dieCategory} />
                  ) : (
                    <span className="text-[11px] text-[#9CA3AF]">—</span>
                  )}
                </div>

                {/* Score */}
                <div>
                  {invoice.recoveryScore !== undefined ? (
                    <RecoveryScore score={invoice.recoveryScore} />
                  ) : (
                    <span className="text-[11px] text-[#9CA3AF]">—</span>
                  )}
                </div>

                {/* Sequence */}
                <span className="text-[12px] text-[#4B5563]">
                  {invoice.retryCount > 0 ? `Step ${invoice.retryCount}` : 'Not started'}
                </span>

                {/* Next retry */}
                <span className="text-[12px] text-[#4B5563]">
                  {formatDate(invoice.nextRetryAt)}
                </span>

                {/* Status */}
                <div>
                  <StatusBadge status={invoice.status} />
                </div>

                {/* Actions — link to Stripe invoice */}
                <a
                  href={getStripeInvoiceUrl(invoice.stripeInvoiceId, livemode)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="View in Stripe Dashboard"
                  className="flex items-center justify-center w-8 h-8 rounded text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6C63FF] transition-colors"
                >
                  ↗
                </a>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-[#4B5563]">
        <span>
          Showing {Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total} invoices
        </span>
        <div className="flex items-center gap-2">
          {page > 1 && (
            <a
              href={`/invoices?page=${page - 1}&category=${category}&status=${statusFilter}`}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F7F5F2] transition-colors text-[#4B5563]"
            >
              ← Previous
            </a>
          )}
          {page < totalPages && (
            <a
              href={`/invoices?page=${page + 1}&category=${category}&status=${statusFilter}`}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F7F5F2] transition-colors text-[#4B5563]"
            >
              Next →
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

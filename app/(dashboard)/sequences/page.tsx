import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import DunningSequenceModel from '@/models/DunningSequence';
import EmailEventModel from '@/models/EmailEvent';
import InvoiceModel from '@/models/Invoice';
import DIEBadge from '@/components/revenant/DIEBadge';
import { DunningSequence } from '@/types/revenant';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    tab?: string;
    page?: string;
  }>;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function docToSequence(doc: any): DunningSequence {
  return {
    _id: doc._id?.toString() ?? '',
    invoiceId: doc.invoiceId?.toString() ?? '',
    orgId: doc.orgId?.toString() ?? '',
    category: doc.category ?? 'SOFT_TEMPORARY',
    status: doc.status ?? 'active',
    currentStep: doc.currentStep ?? 0,
    steps: (doc.steps ?? []).map((s: any) => ({
      step: s.step,
      scheduledAt: s.scheduledAt?.toISOString() ?? new Date().toISOString(),
      sentAt: s.sentAt?.toISOString(),
    })),
    stoppedAt: doc.stoppedAt?.toISOString(),
    stoppedReason: doc.stoppedReason,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

function SequenceStatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string }> = {
    active: { bg: '#DBEAFE', text: '#1D4ED8' },
    completed: { bg: '#DCFCE7', text: '#15803D' },
    recovered: { bg: '#DCFCE7', text: '#15803D' },
    stopped: { bg: '#F3F4F6', text: '#6B7280' },
  };
  const c = config[status] ?? { bg: '#F3F4F6', text: '#6B7280' };
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {label}
    </span>
  );
}

function getNextScheduledStep(seq: DunningSequence): string {
  const pending = seq.steps.find((s) => !s.sentAt);
  return pending ? formatDate(pending.scheduledAt) : '—';
}

export default async function SequencesPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.email) {
    redirect('/api/auth/signin');
  }

  const params = await searchParams;
  const tab = params.tab ?? 'active';
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const orgId = session.user.email;

  let sequences: DunningSequence[] = [];
  let total = 0;
  let activeCount = 0;
  let emailsSent = 0;
  let recoveryRate = 0;
  let error: string | null = null;

  // Map sequenceId → invoice customer info
  const invoiceMap: Record<string, any> = {};

  try {
    await connectMongo();

    const statusFilter = tab === 'active' ? { status: 'active' } : { status: { $ne: 'active' } };
    const query = { orgId, ...statusFilter };

    total = await (DunningSequenceModel as any).countDocuments(query);
    const raw = await (DunningSequenceModel as any)
      .find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    sequences = raw.map(docToSequence);

    // Load invoice info for each sequence
    const invoiceIds = sequences.map((s) => s.invoiceId).filter(Boolean);
    if (invoiceIds.length > 0) {
      const invoices = await (InvoiceModel as any)
        .find({ _id: { $in: invoiceIds } })
        .select('customerEmail customerName amount')
        .lean();
      invoices.forEach((inv: any) => {
        invoiceMap[inv._id.toString()] = inv;
      });
    }

    // Stats
    activeCount = await (DunningSequenceModel as any).countDocuments({ orgId, status: 'active' });
    emailsSent = await (EmailEventModel as any).countDocuments({ orgId });
    const recoveredCount = await (DunningSequenceModel as any).countDocuments({
      orgId,
      status: 'recovered',
    });
    const totalEnded = await (DunningSequenceModel as any).countDocuments({
      orgId,
      status: { $in: ['recovered', 'completed', 'stopped'] },
    });
    recoveryRate = totalEnded > 0 ? Math.round((recoveredCount / totalEnded) * 100) : 0;
  } catch (err) {
    console.error('[SequencesPage] Error:', err);
    error = 'Failed to load sequences. Please try again.';
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const statCards = [
    {
      label: 'Active sequences',
      value: String(activeCount),
      color: '#6C63FF',
    },
    {
      label: 'Emails sent',
      value: emailsSent.toLocaleString(),
      color: '#1A1A1A',
    },
    {
      label: 'Recovery rate',
      value: `${recoveryRate}%`,
      color: recoveryRate >= 30 ? '#16A34A' : '#DC2626',
    },
  ];

  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <h1 className="text-[22px] font-bold text-[#1A1A1A]">Sequences</h1>

      {/* Error */}
      {error && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-4 text-[#DC2626] text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center border-b border-[#E5E7EB]">
        {['active', 'history'].map((t) => {
          const isActive = tab === t;
          const label = t === 'active' ? 'Active' : 'History';
          return (
            <a
              key={t}
              href={`/sequences?tab=${t}`}
              className="px-4 py-2.5 text-sm font-medium transition-colors"
              style={{
                color: isActive ? '#6C63FF' : '#4B5563',
                borderBottom: isActive ? '2px solid #6C63FF' : '2px solid transparent',
                marginBottom: '-1px',
              }}
            >
              {label}
            </a>
          );
        })}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <div
            key={stat.label}
            className="bg-white rounded-lg p-5 flex flex-col gap-2"
            style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
          >
            <span className="text-[12px] font-medium text-[#4B5563]">{stat.label}</span>
            <span className="text-[28px] font-bold" style={{ color: stat.color }}>
              {stat.value}
            </span>
          </div>
        ))}
      </div>

      {/* Table */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        {/* Header */}
        <div
          className="grid items-center px-4 h-9"
          style={{
            backgroundColor: '#F7F5F2',
            borderBottom: '1px solid #E5E7EB',
            gridTemplateColumns: '1fr 8rem 5rem 7rem 7rem 7rem 2.5rem',
          }}
        >
          {['CUSTOMER', 'CATEGORY', 'STEP', 'NEXT EMAIL', 'STARTED', 'STATUS', ''].map((col) => (
            <span key={col} className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]">
              {col}
            </span>
          ))}
        </div>

        {/* Rows */}
        {sequences.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-[#9CA3AF]">
            No sequences found
          </div>
        ) : (
          sequences.map((seq) => {
            const inv = invoiceMap[seq.invoiceId];
            const displayName =
              inv?.customerName || inv?.customerEmail || `Invoice ${seq.invoiceId.slice(-6)}`;
            const displayEmail = inv?.customerName ? inv?.customerEmail : undefined;

            return (
              <div
                key={seq._id}
                className="grid items-center px-4 h-14 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] transition-colors"
                style={{
                  gridTemplateColumns: '1fr 8rem 5rem 7rem 7rem 7rem 2.5rem',
                }}
              >
                {/* Customer */}
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{displayName}</span>
                  {displayEmail && (
                    <span className="text-[11px] text-[#9CA3AF] truncate">{displayEmail}</span>
                  )}
                </div>

                {/* Category */}
                <div>
                  <DIEBadge category={seq.category} />
                </div>

                {/* Step */}
                <span className="text-[12px] text-[#4B5563]">
                  {seq.currentStep + 1} / {seq.steps.length || '?'}
                </span>

                {/* Next email */}
                <span className="text-[12px] text-[#4B5563]">
                  {seq.status === 'active' ? getNextScheduledStep(seq) : '—'}
                </span>

                {/* Started */}
                <span className="text-[12px] text-[#4B5563]">
                  {formatDate(seq.createdAt)}
                </span>

                {/* Status */}
                <div>
                  <SequenceStatusBadge status={seq.status} />
                </div>

                {/* Actions */}
                <button className="flex items-center justify-center w-8 h-8 rounded text-[#9CA3AF] hover:bg-[#F3F4F6] transition-colors">
                  ⋯
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-[#4B5563]">
        <span>
          Showing {total === 0 ? 0 : Math.min((page - 1) * PAGE_SIZE + 1, total)}–{Math.min(page * PAGE_SIZE, total)} of {total} sequences
        </span>
        <div className="flex items-center gap-2">
          {page > 1 && (
            <a
              href={`/sequences?tab=${tab}&page=${page - 1}`}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F7F5F2] transition-colors text-[#4B5563]"
            >
              ← Previous
            </a>
          )}
          {page < totalPages && (
            <a
              href={`/sequences?tab=${tab}&page=${page + 1}`}
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

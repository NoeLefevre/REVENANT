import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import SubscriptionModel from '@/models/Subscription';
import RecoveryScore from '@/components/revenant/RecoveryScore';
import { Subscription } from '@/types/revenant';

const PAGE_SIZE = 20;

interface PageProps {
  searchParams: Promise<{
    page?: string;
    search?: string;
  }>;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
}

function docToSubscription(doc: any): Subscription {
  return {
    _id: doc._id?.toString() ?? '',
    orgId: doc.orgId?.toString() ?? '',
    stripeSubscriptionId: doc.stripeSubscriptionId ?? '',
    stripeCustomerId: doc.stripeCustomerId ?? '',
    customerEmail: doc.customerEmail ?? null,
    customerName: doc.customerName ?? null,
    status: doc.status ?? 'active',
    mrr: doc.mrr ?? 0,
    cardBrand: doc.cardBrand ?? null,
    cardLast4: doc.cardLast4 ?? null,
    cardExpMonth: doc.cardExpMonth ?? null,
    cardExpYear: doc.cardExpYear ?? null,
    cardCountry: doc.cardCountry ?? null,
    recoveryScore: doc.recoveryScore ?? null,
    inferredPaydayCycle: doc.inferredPaydayCycle ?? null,
    currentPeriodEnd: doc.currentPeriodEnd?.toISOString() ?? null,
    createdAt: doc.createdAt?.toISOString() ?? new Date().toISOString(),
    updatedAt: doc.updatedAt?.toISOString() ?? new Date().toISOString(),
  };
}

// ── Avatar ────────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  '#6C63FF', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) >>> 0;
  }
  return h;
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return '??';
}

function CustomerAvatar({ name, email, customerId }: { name?: string | null; email?: string | null; customerId: string }) {
  const seed = email ?? customerId;
  const color = AVATAR_COLORS[hashStr(seed) % AVATAR_COLORS.length];
  const initials = getInitials(name, email);

  return (
    <span
      className="inline-flex items-center justify-center rounded-full text-white font-semibold flex-shrink-0"
      style={{ width: 32, height: 32, backgroundColor: color, fontSize: 11, letterSpacing: '0.05em' }}
    >
      {initials}
    </span>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { bg: string; text: string; label: string }> = {
    active:   { bg: '#DCFCE7', text: '#15803D', label: 'Active' },
    past_due: { bg: '#FEF2F2', text: '#DC2626', label: 'Past due' },
    canceled: { bg: '#F3F4F6', text: '#6B7280', label: 'Canceled' },
    trialing: { bg: '#DBEAFE', text: '#1D4ED8', label: 'Trialing' },
    unpaid:   { bg: '#FEE2E2', text: '#991B1B', label: 'Unpaid' },
  };
  const c = config[status] ?? { bg: '#F3F4F6', text: '#6B7280', label: status };

  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: c.bg, color: c.text }}
    >
      {c.label}
    </span>
  );
}

// ── Card display ──────────────────────────────────────────────────────────────

function CardDisplay({ sub }: { sub: Subscription }) {
  if (!sub.cardBrand && !sub.cardLast4) {
    return <span className="text-[12px] text-[#9CA3AF]">—</span>;
  }
  const brand = sub.cardBrand
    ? sub.cardBrand.charAt(0).toUpperCase() + sub.cardBrand.slice(1)
    : '';
  return (
    <span className="text-[12px] text-[#4B5563]">
      {brand} ···· {sub.cardLast4 ?? ''}
    </span>
  );
}

function CardExpiry({ sub }: { sub: Subscription }) {
  if (!sub.cardExpMonth || !sub.cardExpYear) {
    return <span className="text-[12px] text-[#9CA3AF]">—</span>;
  }
  const now = new Date();
  const expDate = new Date(sub.cardExpYear, sub.cardExpMonth - 1);
  const isExpired = expDate < now;
  const isExpiringSoon =
    !isExpired && expDate <= new Date(now.getFullYear(), now.getMonth() + 3);

  const label = `${String(sub.cardExpMonth).padStart(2, '0')}/${String(sub.cardExpYear).slice(-2)}`;

  return (
    <span
      className="text-[12px] font-medium"
      style={{
        color: isExpired ? '#DC2626' : isExpiringSoon ? '#D97706' : '#4B5563',
      }}
    >
      {label}
    </span>
  );
}

// ── Customer identity cell ────────────────────────────────────────────────────

function CustomerCell({ sub }: { sub: Subscription }) {
  const hasName = !!sub.customerName;
  const hasEmail = !!sub.customerEmail;

  return (
    <div className="flex items-center gap-2.5 min-w-0 pr-2">
      <CustomerAvatar name={sub.customerName} email={sub.customerEmail} customerId={sub.stripeCustomerId} />
      <div className="flex flex-col min-w-0">
        {hasName || hasEmail ? (
          <>
            <span className="text-[13px] font-semibold text-[#1A1A1A] truncate leading-tight">
              {sub.customerName ?? 'Client inconnu'}
            </span>
            {hasEmail && (
              <span className="text-[11px] text-[#9CA3AF] truncate leading-tight">
                {sub.customerEmail}
              </span>
            )}
          </>
        ) : (
          <span className="text-[12px] text-[#9CA3AF] font-mono truncate">
            {sub.stripeCustomerId}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function CustomersPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? '1', 10));
  const search = params.search ?? '';

  const orgId = session.user.id;

  let subscriptions: Subscription[] = [];
  let total = 0;
  let error: string | null = null;

  try {
    await connectMongo();

    const query: Record<string, any> = { orgId };
    if (search) {
      query.$or = [
        { customerEmail: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { stripeCustomerId: { $regex: search, $options: 'i' } },
      ];
    }

    total = await (SubscriptionModel as any).countDocuments(query);
    const raw = await (SubscriptionModel as any)
      .find(query)
      .sort({ mrr: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean();

    subscriptions = raw.map(docToSubscription);
  } catch (err) {
    console.error('[CustomersPage] Error:', err);
    error = 'Failed to load customers. Please try again.';
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const missingDataCount = subscriptions.filter((s) => !s.customerEmail && !s.customerName).length;

  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">Customers</h1>
          {total > 0 && (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium"
              style={{ backgroundColor: '#EDE9FE', color: '#6C63FF' }}
            >
              {total}
            </span>
          )}
        </div>
        <form method="GET" action="/customers">
          <input
            name="search"
            defaultValue={search}
            placeholder="Search name, email, ID…"
            className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white text-sm text-[#1A1A1A] placeholder:text-[#9CA3AF] outline-none focus:border-[#6C63FF] transition-colors"
            style={{ width: '240px' }}
          />
        </form>
      </div>

      {/* Banner: customers with missing data */}
      {missingDataCount > 0 && (
        <div
          className="flex items-center gap-3 rounded-lg px-4 py-3 text-sm"
          style={{ backgroundColor: '#FFFBEB', border: '1px solid #FDE68A', color: '#92400E' }}
        >
          <span>⚠</span>
          <span>
            <strong>{missingDataCount}</strong> customer{missingDataCount > 1 ? 's' : ''} sans email ni nom — les prochains webhooks Stripe les résoudront automatiquement. Relancez un sync pour les backfiller.
          </span>
        </div>
      )}

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
        {/* Header */}
        <div
          className="grid items-center px-4 h-9"
          style={{
            backgroundColor: '#F7F5F2',
            borderBottom: '1px solid #E5E7EB',
            gridTemplateColumns: '1fr 6rem 9rem 5.5rem 5rem 7rem 6rem 2.5rem',
          }}
        >
          {['CUSTOMER', 'MRR', 'CARD', 'EXP', 'SCORE', 'PERIOD END', 'STATUS', ''].map((col) => (
            <span
              key={col}
              className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]"
            >
              {col}
            </span>
          ))}
        </div>

        {/* Rows */}
        {subscriptions.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-[#9CA3AF]">
            No customers found
          </div>
        ) : (
          subscriptions.map((sub) => (
            <div
              key={sub._id}
              className="grid items-center px-4 h-14 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] transition-colors"
              style={{
                gridTemplateColumns: '1fr 6rem 9rem 5.5rem 5rem 7rem 6rem 2.5rem',
              }}
            >
              {/* Customer identity */}
              <CustomerCell sub={sub} />

              {/* MRR */}
              <span className="text-[13px] font-semibold text-[#1A1A1A]">
                {formatCurrency(sub.mrr)}
              </span>

              {/* Card */}
              <CardDisplay sub={sub} />

              {/* Expiry */}
              <CardExpiry sub={sub} />

              {/* Recovery score */}
              <div>
                {sub.recoveryScore != null ? (
                  <RecoveryScore score={sub.recoveryScore} />
                ) : (
                  <span className="text-[11px] text-[#9CA3AF]">—</span>
                )}
              </div>

              {/* Period end */}
              <span className="text-[12px] text-[#4B5563]">
                {formatDate(sub.currentPeriodEnd)}
              </span>

              {/* Status */}
              <div>
                <StatusBadge status={sub.status} />
              </div>

              {/* Actions */}
              <button className="flex items-center justify-center w-8 h-8 rounded text-[#9CA3AF] hover:bg-[#F3F4F6] transition-colors">
                ⋯
              </button>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between text-sm text-[#4B5563]">
        <span>
          {total === 0
            ? 'No customers'
            : `Showing ${Math.min((page - 1) * PAGE_SIZE + 1, total)}–${Math.min(page * PAGE_SIZE, total)} of ${total} customers`}
        </span>
        <div className="flex items-center gap-2">
          {page > 1 && (
            <a
              href={`/customers?page=${page - 1}&search=${search}`}
              className="px-3 py-1.5 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F7F5F2] transition-colors text-[#4B5563]"
            >
              ← Previous
            </a>
          )}
          {page < totalPages && (
            <a
              href={`/customers?page=${page + 1}&search=${search}`}
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

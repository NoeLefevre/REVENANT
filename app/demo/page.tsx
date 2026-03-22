import Link from 'next/link';
import AtRiskBanner from '@/components/revenant/AtRiskBanner';
import MetricCard from '@/components/revenant/MetricCard';
import WarRoomBoard from '@/components/revenant/WarRoomBoard';
import DIEBadge from '@/components/revenant/DIEBadge';
import RecoveryScore from '@/components/revenant/RecoveryScore';
import { Invoice } from '@/types/revenant';

export const metadata = {
  title: 'Live Demo — REVENANT',
  description: 'See how REVENANT protects MRR from failed payments. Explore the dashboard with realistic demo data.',
};

// ── Realistic mock data (amounts in cents, real Stripe decline codes) ──────────

const MOCK_INVOICES: Invoice[] = [
  {
    _id: 'inv_001',
    orgId: 'demo',
    stripeInvoiceId: 'in_1OaB2xKZDemo001',
    stripeSubscriptionId: 'sub_1OaB2xKZSub001',
    stripeCustomerId: 'cus_demo001',
    customerName: 'Acme Corp',
    customerEmail: 'billing@acmecorp.io',
    amount: 89000,      // $890.00
    currency: 'usd',
    status: 'open',
    dieCategory: 'SOFT_TEMPORARY',
    failureCode: 'insufficient_funds',
    failureMessage: 'Your card has insufficient funds.',
    failedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    retryCount: 1,
    nextRetryAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
    nextRetrySource: 'payday_inferred',
    recoveryScore: 82,
    createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'inv_002',
    orgId: 'demo',
    stripeInvoiceId: 'in_1OaB2xKZDemo002',
    stripeSubscriptionId: 'sub_1OaB2xKZSub002',
    stripeCustomerId: 'cus_demo002',
    customerName: 'Bright Labs',
    customerEmail: 'finance@brightlabs.co',
    amount: 124000,     // $1,240.00
    currency: 'usd',
    status: 'open',
    dieCategory: 'SOFT_TEMPORARY',
    failureCode: 'card_declined',
    failureMessage: 'Your card was declined.',
    failedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    retryCount: 0,
    nextRetryAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    nextRetrySource: 'country_benchmark',
    recoveryScore: 74,
    createdAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'inv_003',
    orgId: 'demo',
    stripeInvoiceId: 'in_1OaB2xKZDemo003',
    stripeSubscriptionId: 'sub_1OaB2xKZSub003',
    stripeCustomerId: 'cus_demo003',
    customerName: 'Drift Studio',
    customerEmail: 'ops@driftstudio.com',
    amount: 44000,      // $440.00
    currency: 'usd',
    status: 'open',
    dieCategory: 'SOFT_UPDATABLE',
    failureCode: 'card_expired',
    failureMessage: 'Your card has expired.',
    failedAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    retryCount: 0,
    nextRetryAt: undefined,
    recoveryScore: 55,
    createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'inv_004',
    orgId: 'demo',
    stripeInvoiceId: 'in_1OaB2xKZDemo004',
    stripeSubscriptionId: 'sub_1OaB2xKZSub004',
    stripeCustomerId: 'cus_demo004',
    customerName: 'Volta Systems',
    customerEmail: 'accounts@voltasystems.io',
    amount: 32000,      // $320.00
    currency: 'usd',
    status: 'open',
    dieCategory: 'SOFT_TEMPORARY',
    failureCode: 'do_not_honor',
    failureMessage: 'The card issuer declined this payment.',
    failedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    retryCount: 2,
    nextRetryAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
    nextRetrySource: 'payday_inferred',
    recoveryScore: 48,
    createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    _id: 'inv_005',
    orgId: 'demo',
    stripeInvoiceId: 'in_1OaB2xKZDemo005',
    stripeSubscriptionId: 'sub_1OaB2xKZSub005',
    stripeCustomerId: 'cus_demo005',
    customerName: 'Helix Health',
    customerEmail: 'billing@helixhealth.com',
    amount: 18500,      // $185.00
    currency: 'usd',
    status: 'open',
    dieCategory: 'HARD_PERMANENT',
    failureCode: 'card_velocity_exceeded',
    failureMessage: 'Card velocity limit exceeded.',
    failedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    retryCount: 0,
    recoveryScore: 22,
    createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const MOCK_METRICS = {
  protectedMrr: 3_420_000,       // $34,200
  recoveredMrr: 78_000,           // $780 recovered this month
  recoveredMrrLastMonth: 52_000,  // $520 last month
  protectedMrrLastMonth: 3_040_000,
  activeSequences: 3,
  sequencesCompletingThisWeek: 1,
};

// ── Derived values ─────────────────────────────────────────────────────────────

const mrrAtRisk = MOCK_INVOICES
  .filter((i) => i.status === 'open')
  .reduce((s, i) => s + i.amount, 0);   // $3,075.00

const openInvoices = MOCK_INVOICES.filter((i) => i.status === 'open');
const temporaryAmount = openInvoices
  .filter((i) => i.dieCategory === 'SOFT_TEMPORARY')
  .reduce((s, i) => s + i.amount, 0);
const updatableAmount = openInvoices
  .filter((i) => i.dieCategory === 'SOFT_UPDATABLE')
  .reduce((s, i) => s + i.amount, 0);

const highValue  = openInvoices.filter((i) => (i.recoveryScore ?? 0) >= 70);
const standard   = openInvoices.filter((i) => { const s = i.recoveryScore ?? 0; return s >= 40 && s < 70; });
const lowPriority = openInvoices.filter((i) => (i.recoveryScore ?? 0) < 40);

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(iso?: string) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Demo banner ───────────────────────────────────────────────────────────────

function DemoBanner() {
  return (
    <div
      className="flex items-center justify-between px-6 py-3"
      style={{ backgroundColor: '#1A1A1A' }}
    >
      <div className="flex items-center gap-3">
        <span
          className="px-2 py-0.5 rounded text-[11px] font-bold text-white"
          style={{ backgroundColor: '#6C63FF' }}
        >
          DEMO
        </span>
        <span className="text-[13px] text-[#9CA3AF]">
          This is a preview with realistic mock data — your real numbers will look like this.
        </span>
      </div>
      <Link
        href="/audit"
        className="flex-shrink-0 px-4 py-2 rounded-lg text-white text-[13px] font-semibold transition-opacity hover:opacity-90"
        style={{ backgroundColor: '#6C63FF' }}
      >
        Protect my MRR →
      </Link>
    </div>
  );
}

// ── Fake Sidebar ──────────────────────────────────────────────────────────────

function DemoSidebar() {
  const navItems = [
    { label: 'Overview', href: '#', active: true, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
        <rect x="14" y="14" width="7" height="7" /><rect x="3" y="14" width="7" height="7" />
      </svg>
    )},
    { label: 'Invoices', href: '#', active: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
    )},
    { label: 'Customers', href: '#', active: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
    )},
    { label: 'Prevention', href: '#', active: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" />
      </svg>
    )},
    { label: 'Sequences', href: '#', active: false, icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="20" height="16" rx="2" /><polyline points="2,4 12,13 22,4" />
      </svg>
    )},
  ];

  return (
    <aside
      className="flex flex-col gap-1 p-3 flex-shrink-0"
      style={{ width: '220px', borderRight: '1px solid #F0EDE8', backgroundColor: 'white' }}
    >
      {/* Logo */}
      <div className="h-12 flex items-center gap-1.5 px-3 mb-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
      </div>

      {navItems.map((item) => (
        <div
          key={item.label}
          className="h-9 px-3 rounded-lg flex items-center gap-2.5 text-sm font-medium cursor-default"
          style={{
            backgroundColor: item.active ? '#EDE9FE' : 'transparent',
            color: item.active ? '#6C63FF' : '#4B5563',
          }}
        >
          <span style={{ color: item.active ? '#6C63FF' : '#9CA3AF' }}>{item.icon}</span>
          {item.label}
        </div>
      ))}

      {/* User area */}
      <div className="mt-auto pt-4 border-t border-[#F0EDE8] px-3 flex items-center gap-2.5">
        <div
          className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-bold"
          style={{ backgroundColor: '#6C63FF' }}
        >
          A
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-[12px] font-medium text-[#1A1A1A] truncate">Acme SaaS</span>
          <span className="text-[11px] text-[#9CA3AF] truncate">demo@acmesaas.io</span>
        </div>
      </div>
    </aside>
  );
}

// ── Invoice table (read-only demo version) ────────────────────────────────────

function InvoiceTableRow({ invoice }: { invoice: Invoice }) {
  const displayName = invoice.customerName || invoice.customerEmail || invoice.stripeCustomerId;
  return (
    <div
      className="grid items-center px-4 h-14 border-b border-[#E5E7EB] last:border-b-0"
      style={{
        gridTemplateColumns: '1fr 6rem 7rem 5rem 7rem 6rem 6rem',
        backgroundColor: invoice.dieCategory === 'SOFT_TEMPORARY' ? '#F5F3FF' : undefined,
        borderLeft: invoice.dieCategory === 'SOFT_TEMPORARY' ? '2px solid #6C63FF' : undefined,
      }}
    >
      <div className="flex flex-col min-w-0 pr-2">
        <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{displayName}</span>
        {invoice.customerEmail && invoice.customerName && (
          <span className="text-[11px] text-[#9CA3AF] truncate">{invoice.customerEmail}</span>
        )}
      </div>
      <span className="text-[13px] font-semibold text-[#1A1A1A]">{formatCurrency(invoice.amount)}</span>
      <div>{invoice.dieCategory ? <DIEBadge category={invoice.dieCategory} /> : '—'}</div>
      <div>{invoice.recoveryScore !== undefined ? <RecoveryScore score={invoice.recoveryScore} /> : '—'}</div>
      <span className="text-[12px] text-[#4B5563]">{invoice.retryCount > 0 ? `Step ${invoice.retryCount}` : 'Not started'}</span>
      <span className="text-[12px] text-[#4B5563]">{formatDate(invoice.nextRetryAt)}</span>
      <span
        className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
        style={{ backgroundColor: '#DBEAFE', color: '#1D4ED8', width: 'fit-content' }}
      >
        In recovery
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DemoPage() {
  const protectedDelta = MOCK_METRICS.protectedMrr - MOCK_METRICS.protectedMrrLastMonth;
  const recoveredDelta = MOCK_METRICS.recoveredMrr - MOCK_METRICS.recoveredMrrLastMonth;

  return (
    <div className="flex flex-col min-h-screen" style={{ backgroundColor: '#FAF8F5' }}>
      <DemoBanner />

      <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        <DemoSidebar />

        <main className="flex-1 overflow-auto">
          {/* At-risk banner */}
          <AtRiskBanner
            amount={mrrAtRisk}
            count={openInvoices.length}
            temporaryAmount={temporaryAmount}
            updatableAmount={updatableAmount}
            trend={12}
          />

          <div className="p-6 flex flex-col gap-6">
            <h1 className="text-[22px] font-bold text-[#1A1A1A]">Overview</h1>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4">
              <MetricCard
                label="Protected MRR this month"
                value={formatCurrency(MOCK_METRICS.protectedMrr)}
                delta={`↑ ${formatCurrency(Math.max(0, protectedDelta))} vs last month`}
                color="green"
                icon="shield"
              />
              <MetricCard
                label="Recovered MRR this month"
                value={formatCurrency(MOCK_METRICS.recoveredMrr)}
                delta={`↑ ${formatCurrency(Math.max(0, recoveredDelta))} vs last month`}
                color="purple"
                icon="trending-up"
              />
              <MetricCard
                label="Active sequences"
                value={String(MOCK_METRICS.activeSequences)}
                delta={`${MOCK_METRICS.sequencesCompletingThisWeek} completing this week`}
                color="gray"
                icon="mail"
              />
            </div>

            {/* War Room */}
            <div>
              <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-4">War Room</h2>
              <WarRoomBoard
                highValue={highValue}
                standard={standard}
                lowPriority={lowPriority}
              />
            </div>

            {/* Invoice table preview */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Failed Invoices</h2>
                <span
                  className="text-[12px] px-2.5 py-1 rounded font-medium"
                  style={{ backgroundColor: '#EDE9FE', color: '#6C63FF' }}
                >
                  {openInvoices.length} in recovery
                </span>
              </div>
              <div
                className="bg-white rounded-lg overflow-hidden"
                style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
              >
                <div
                  className="grid items-center px-4 h-9"
                  style={{
                    backgroundColor: '#F7F5F2',
                    borderBottom: '1px solid #E5E7EB',
                    gridTemplateColumns: '1fr 6rem 7rem 5rem 7rem 6rem 6rem',
                  }}
                >
                  {['CUSTOMER', 'AMOUNT', 'CATEGORY', 'SCORE', 'SEQUENCE', 'NEXT RETRY', 'STATUS'].map((col) => (
                    <span key={col} className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]">
                      {col}
                    </span>
                  ))}
                </div>
                {MOCK_INVOICES.filter((i) => i.status === 'open').map((invoice) => (
                  <InvoiceTableRow key={invoice._id} invoice={invoice} />
                ))}
              </div>
            </div>

            {/* CTA */}
            <div
              className="flex flex-col items-center gap-4 py-10 rounded-xl text-center"
              style={{ backgroundColor: '#1A1A1A' }}
            >
              <p className="text-[18px] font-bold text-white">
                Ready to protect your real MRR?
              </p>
              <p className="text-[14px] text-[#9CA3AF] max-w-sm">
                Connect your Stripe in 60 seconds and get your actual revenue health audit for free.
              </p>
              <Link
                href="/audit"
                className="px-6 py-3 rounded-lg text-white text-[15px] font-semibold transition-opacity hover:opacity-90"
                style={{ backgroundColor: '#6C63FF' }}
              >
                Get my free audit →
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

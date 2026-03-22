import Link from 'next/link';

// ── Mock data (mirrors /demo exactly) ────────────────────────────────────────

const INVOICES = [
  { id: '1', customer: 'Acme Corp',     amount: 89000,  die: 'SOFT_TEMPORARY', code: 'insufficient_funds',    score: 82 },
  { id: '2', customer: 'Bright Labs',   amount: 124000, die: 'SOFT_TEMPORARY', code: 'card_declined',          score: 74 },
  { id: '3', customer: 'Drift Studio',  amount: 44000,  die: 'SOFT_UPDATABLE', code: 'card_expired',           score: 55 },
  { id: '4', customer: 'Volta Systems', amount: 32000,  die: 'SOFT_TEMPORARY', code: 'do_not_honor',           score: 48 },
  { id: '5', customer: 'Helix Health',  amount: 18500,  die: 'HARD_PERMANENT', code: 'card_velocity_exceeded', score: 22 },
];

const HIGH_VALUE   = INVOICES.filter(i => i.score >= 70);
const STANDARD     = INVOICES.filter(i => i.score >= 40 && i.score < 70);
const LOW_PRIORITY = INVOICES.filter(i => i.score < 40);

function fmt(cents: number) {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

// ── Mini atoms ────────────────────────────────────────────────────────────────

const DIE_MAP: Record<string, { bg: string; color: string; label: string }> = {
  SOFT_TEMPORARY: { bg: '#FEF9C3', color: '#854D0E', label: 'Temporary'  },
  SOFT_UPDATABLE: { bg: '#FED7AA', color: '#9A3412', label: 'Card update' },
  HARD_PERMANENT: { bg: '#FEE2E2', color: '#991B1B', label: 'Permanent'  },
};

function MiniBadge({ die }: { die: string }) {
  const s = DIE_MAP[die] ?? { bg: '#F3F4F6', color: '#6B7280', label: die };
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 whitespace-nowrap font-semibold"
      style={{ fontSize: 9, backgroundColor: s.bg, color: s.color }}
    >
      {s.label}
    </span>
  );
}

function MiniScore({ score }: { score: number }) {
  const color = score >= 70 ? '#16A34A' : score >= 40 ? '#D97706' : '#DC2626';
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color, fontVariantNumeric: 'tabular-nums' }}>
      {score}
    </span>
  );
}

// ── Browser chrome ────────────────────────────────────────────────────────────

function ChromeBar() {
  return (
    <div
      className="flex items-center gap-3 px-4 flex-shrink-0"
      style={{ height: 36, backgroundColor: '#E8E4DF', borderBottom: '1px solid #D5CFC8' }}
    >
      {/* macOS dots */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {(['#FF5F56', '#FFBD2E', '#27C93F'] as const).map((c) => (
          <div key={c} style={{ width: 10, height: 10, borderRadius: 9999, backgroundColor: c }} />
        ))}
      </div>
      {/* URL bar */}
      <div className="flex-1 flex items-center justify-center">
        <div
          className="flex items-center gap-1.5 rounded"
          style={{
            backgroundColor: 'white',
            border: '1px solid #D5CFC8',
            padding: '3px 10px',
            maxWidth: 260,
            width: '100%',
          }}
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>app.revenant.so/overview</span>
        </div>
      </div>
      {/* Balance placeholder */}
      <div style={{ width: 54 }} />
    </div>
  );
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

const NAV = [
  { label: 'Overview',   active: true  },
  { label: 'Invoices',   active: false },
  { label: 'Customers',  active: false },
  { label: 'Prevention', active: false },
  { label: 'Sequences',  active: false },
];

function MiniSidebar() {
  return (
    <aside
      className="flex flex-col flex-shrink-0"
      style={{ width: 148, borderRight: '1px solid #F0EDE8', backgroundColor: 'white' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-1.5 px-3" style={{ height: 40 }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
        </svg>
        <span style={{ fontSize: 11, fontWeight: 700, color: '#6C63FF', letterSpacing: '0.01em' }}>REVENANT</span>
      </div>

      {/* Nav */}
      <div className="flex flex-col gap-0.5 px-2 flex-1">
        {NAV.map((item) => (
          <div
            key={item.label}
            className="flex items-center rounded"
            style={{
              height: 28,
              paddingLeft: 8,
              fontSize: 11,
              fontWeight: item.active ? 500 : 400,
              backgroundColor: item.active ? '#EDE9FE' : 'transparent',
              color: item.active ? '#6C63FF' : '#9CA3AF',
            }}
          >
            {item.label}
          </div>
        ))}
      </div>

      {/* User */}
      <div
        className="flex items-center gap-2 mx-2 mb-3 mt-auto px-2 pt-3"
        style={{ borderTop: '1px solid #F0EDE8' }}
      >
        <div
          className="flex-shrink-0 flex items-center justify-center rounded-full text-white font-bold"
          style={{ width: 20, height: 20, fontSize: 8, backgroundColor: '#6C63FF' }}
        >
          A
        </div>
        <div className="overflow-hidden">
          <div style={{ fontSize: 9, fontWeight: 500, color: '#1A1A1A' }} className="truncate">Acme SaaS</div>
          <div style={{ fontSize: 8, color: '#9CA3AF' }} className="truncate">demo@acme.io</div>
        </div>
      </div>
    </aside>
  );
}

// ── At-risk banner ────────────────────────────────────────────────────────────

function MiniAtRiskBanner() {
  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        height: 36,
        backgroundColor: '#FEF2F2',
        borderBottom: '1px solid #FECACA',
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>$3,075 at risk</span>
      <div className="flex items-center gap-1.5">
        <span
          className="rounded font-medium"
          style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#FEF9C3', color: '#854D0E' }}
        >
          Temporary&nbsp;<strong>$2,570</strong>
        </span>
        <span
          className="rounded font-medium"
          style={{ fontSize: 9, padding: '2px 6px', backgroundColor: '#FED7AA', color: '#9A3412' }}
        >
          Card update&nbsp;<strong>$440</strong>
        </span>
      </div>
      <span style={{ fontSize: 9, fontWeight: 500, color: '#DC2626' }}>↑ 12% vs last month</span>
    </div>
  );
}

// ── Metric cards ──────────────────────────────────────────────────────────────

interface MiniMetricCardProps {
  label: string;
  value: string;
  delta: string;
  valueColor: string;
}

function MiniMetricCard({ label, value, delta, valueColor }: MiniMetricCardProps) {
  return (
    <div
      className="flex flex-col gap-1 flex-1 rounded-lg bg-white"
      style={{ padding: '10px 12px', border: '1px solid #F0EDE8', boxShadow: '0 1px 2px #00000008' }}
    >
      <span style={{ fontSize: 9, color: '#4B5563', lineHeight: 1.3 }}>{label}</span>
      <span style={{ fontSize: 16, fontWeight: 700, color: valueColor, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 9, color: valueColor }}>{delta}</span>
    </div>
  );
}

// ── War Room card ─────────────────────────────────────────────────────────────

interface WarCardProps {
  customer: string;
  amount: number;
  die: string;
  score: number;
  borderColor: string;
}

function MiniWarCard({ customer, amount, die, score, borderColor }: WarCardProps) {
  return (
    <div
      className="flex flex-col gap-1.5 rounded-md bg-white"
      style={{
        padding: '8px 10px',
        border: '1px solid #F0EDE8',
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center justify-between gap-1 overflow-hidden">
        <span className="truncate" style={{ fontSize: 10, fontWeight: 600, color: '#1A1A1A' }}>
          {customer}
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, color: '#1A1A1A', whiteSpace: 'nowrap' }}>
          {fmt(amount)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <MiniBadge die={die} />
        <MiniScore score={score} />
      </div>
    </div>
  );
}

// ── War Room column ───────────────────────────────────────────────────────────

const WAR_COLUMNS = [
  { title: 'HIGH VALUE',   color: '#DC2626', badgeBg: '#FEE2E2', badgeColor: '#DC2626', invoices: HIGH_VALUE   },
  { title: 'STANDARD',    color: '#CA8A04', badgeBg: '#FEF9C3', badgeColor: '#CA8A04', invoices: STANDARD     },
  { title: 'LOW PRIORITY', color: '#9CA3AF', badgeBg: '#F3F4F6', badgeColor: '#6B7280', invoices: LOW_PRIORITY },
];

function MiniWarRoom() {
  return (
    <div className="flex flex-col gap-2">
      <span style={{ fontSize: 11, fontWeight: 600, color: '#1A1A1A' }}>War Room</span>
      <div className="flex gap-2">
        {WAR_COLUMNS.map((col) => (
          <div key={col.title} className="flex flex-col gap-1.5 flex-1 min-w-0">
            {/* Column header */}
            <div className="flex items-center gap-1.5">
              <span
                style={{
                  fontSize: 8,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  color: col.color,
                }}
              >
                {col.title}
              </span>
              <span
                className="flex items-center justify-center rounded-full font-bold"
                style={{
                  width: 14,
                  height: 14,
                  fontSize: 8,
                  backgroundColor: col.badgeBg,
                  color: col.badgeColor,
                }}
              >
                {col.invoices.length}
              </span>
            </div>
            {/* Cards */}
            {col.invoices.slice(0, 2).map((inv) => (
              <MiniWarCard
                key={inv.id}
                customer={inv.customer}
                amount={inv.amount}
                die={inv.die}
                score={inv.score}
                borderColor={col.color}
              />
            ))}
            {col.invoices.length === 0 && (
              <div
                className="flex items-center justify-center rounded-md"
                style={{ height: 50, fontSize: 9, color: '#9CA3AF', backgroundColor: '#FAFAFA', border: '1px dashed #E5E7EB' }}
              >
                No invoices
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main dashboard content ────────────────────────────────────────────────────

function MiniDashboard() {
  return (
    <div className="flex flex-col flex-1 min-w-0" style={{ backgroundColor: '#FAF8F5' }}>
      <MiniAtRiskBanner />
      <div className="flex flex-col gap-3 overflow-hidden" style={{ padding: '12px 14px', flex: 1 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#1A1A1A' }}>Overview</span>

        {/* Metrics */}
        <div className="flex gap-2">
          <MiniMetricCard
            label="Protected MRR this month"
            value={fmt(3_420_000)}
            delta="↑ $3,800 vs last month"
            valueColor="#16A34A"
          />
          <MiniMetricCard
            label="Recovered MRR this month"
            value={fmt(78_000)}
            delta="↑ $260 vs last month"
            valueColor="#6C63FF"
          />
          <MiniMetricCard
            label="Active sequences"
            value="3"
            delta="1 completing this week"
            valueColor="#4B5563"
          />
        </div>

        <MiniWarRoom />
      </div>
    </div>
  );
}

// ── Mobile fallback (3 metric cards, no browser chrome) ──────────────────────

function MobileFallback() {
  return (
    <div className="grid grid-cols-1 gap-3 max-w-sm mx-auto w-full">
      {[
        { label: 'Protected MRR', value: fmt(3_420_000), sub: '↑ $3,800 vs last month', color: '#16A34A', bg: '#DCFCE7' },
        { label: 'Recovered this month', value: fmt(78_000), sub: '↑ $260 vs last month', color: '#6C63FF', bg: '#EDE9FE' },
        { label: 'At risk right now', value: fmt(307500), sub: '4 invoices in recovery', color: '#DC2626', bg: '#FEF2F2' },
      ].map((m) => (
        <div
          key={m.label}
          className="flex items-center gap-4 rounded-xl p-4 bg-white"
          style={{ border: '1px solid #F0EDE8', boxShadow: '0 1px 3px #00000008' }}
        >
          <div
            className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: m.bg }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={m.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="flex flex-col">
            <span style={{ fontSize: 12, color: '#4B5563' }}>{m.label}</span>
            <span style={{ fontSize: 20, fontWeight: 700, color: m.color }}>{m.value}</span>
            <span style={{ fontSize: 11, color: m.color }}>{m.sub}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function DashboardPreview() {
  return (
    <div className="relative w-full" style={{ paddingBottom: 56 }}>
      {/* Purple radial glow — behind everything */}
      <div
        aria-hidden="true"
        className="absolute inset-x-0 top-0 pointer-events-none"
        style={{
          height: '70%',
          background:
            'radial-gradient(ellipse 75% 55% at 50% 10%, rgba(108, 99, 255, 0.14) 0%, rgba(108, 99, 255, 0.04) 50%, transparent 75%)',
          zIndex: 0,
        }}
      />

      {/* ── Desktop: 3D browser mockup ── */}
      <div className="hidden md:block relative px-6" style={{ zIndex: 1 }}>
        <div
          className="relative mx-auto"
          style={{ maxWidth: 1040 }}
        >
          {/* The tilted browser */}
          <div
            style={{
              overflow: 'hidden',
              borderRadius: 12,
              transform: 'perspective(1400px) rotateX(6deg)',
              transformOrigin: 'top center',
              boxShadow:
                '0 0 0 1px rgba(0,0,0,0.06), 0 20px 50px -10px rgba(108,99,255,0.28), 0 12px 28px -8px rgba(0,0,0,0.18)',
            }}
          >
            <ChromeBar />
            <div className="flex" style={{ height: 450 }}>
              <MiniSidebar />
              <MiniDashboard />
            </div>
          </div>

          {/* Gradient fade — overlays bottom half of browser */}
          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 pointer-events-none"
            style={{
              height: '52%',
              background: 'linear-gradient(to bottom, transparent 0%, rgba(250,248,245,0.85) 55%, #FAF8F5 100%)',
              zIndex: 2,
              borderRadius: '0 0 12px 12px',
            }}
          />
        </div>
      </div>

      {/* ── Mobile: simplified cards ── */}
      <div className="md:hidden px-4">
        <MobileFallback />
      </div>

      {/* ── CTAs — sit above the gradient fade ── */}
      <div
        className="absolute inset-x-0 bottom-0 flex flex-col sm:flex-row items-center justify-center gap-3 px-6"
        style={{ zIndex: 10 }}
      >
        <Link
          href="/demo"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-white text-[14px] font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#6C63FF', boxShadow: '0 4px 14px rgba(108,99,255,0.4)' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polygon points="5 3 19 12 5 21 5 3" />
          </svg>
          See full demo
        </Link>
        <Link
          href="/api/auth/signin?callbackUrl=/onboarding"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[14px] font-semibold border transition-colors hover:bg-white"
          style={{ backgroundColor: 'rgba(255,255,255,0.85)', color: '#1A1A1A', borderColor: '#E5E7EB' }}
        >
          Connect Stripe for free →
        </Link>
      </div>
    </div>
  );
}

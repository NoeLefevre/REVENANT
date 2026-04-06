import type { ReactNode } from 'react';
import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import SubscriptionModel from '@/models/Subscription';
import TrialGuardModel from '@/models/TrialGuard';
import StripeConnectionModel from '@/models/StripeConnection';
import RecoveryScore from '@/components/revenant/RecoveryScore';
import { getStripeCustomerUrl } from '@/libs/stripeUrls';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PageProps {
  searchParams: Promise<{ tab?: string }>;
}

type TabId = 'trial-guard' | 'expiring-cards' | 'chargeback-shield';

// ── Constants ─────────────────────────────────────────────────────────────────

const VALID_TABS: TabId[] = ['trial-guard', 'expiring-cards', 'chargeback-shield'];

const AVATAR_COLORS = [
  '#6C63FF', '#10B981', '#F59E0B', '#EF4444',
  '#3B82F6', '#8B5CF6', '#EC4899', '#14B8A6',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getCardExpiryDays(expMonth: number | null, expYear: number | null, now: Date): number | null {
  if (!expMonth || !expYear) return null;
  const expiry = new Date(expYear, expMonth - 1, 28);
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function getInitials(name?: string | null, email?: string | null): string {
  if (name) return name.split(' ').map((w) => w[0] ?? '').join('').slice(0, 2).toUpperCase();
  if (email) return email.slice(0, 2).toUpperCase();
  return '?';
}

function getAvatarColor(seed: string): string {
  let hash = 0;
  for (const c of seed) hash = (hash * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[Math.abs(hash)];
}

function computeTrialScore(signals: string[]): number {
  const weights: Record<string, number> = {
    prepaid_card:                  40,
    card_expires_before_trial_end: 35,
    high_radar_score:              25,
  };
  return Math.max(0, 100 - signals.reduce((s, sig) => s + (weights[sig] ?? 10), 0));
}

// ── SVG Icons (lucide-react not installed — inline SVGs) ──────────────────────

function ShieldIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

function CreditCardIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
    </svg>
  );
}

function AlertTriangleIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

function TrendingUpIcon({ size = 16, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function CheckCircleIcon({ size = 36, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function LockIcon({ size = 20, color = '#9CA3AF' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

// ── Reusable sub-components ───────────────────────────────────────────────────

function StatCard({
  label, value, sub, icon, color,
}: {
  label: string;
  value: string | number;
  sub: string;
  icon: ReactNode;
  color: string;
}) {
  return (
    <div
      className="bg-white rounded-xl p-5 flex flex-col gap-2"
      style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[#4B5563]">{label}</span>
        {icon}
      </div>
      <span className="text-[28px] font-bold leading-none" style={{ color }}>
        {value}
      </span>
      <span className="text-[11px] text-[#9CA3AF]">{sub}</span>
    </div>
  );
}

function Avatar({
  name, email, seed, size = 32,
}: {
  name?: string | null;
  email?: string | null;
  seed?: string;
  size?: number;
}) {
  const initials = getInitials(name, email);
  const bg = getAvatarColor(seed ?? name ?? email ?? '?');
  return (
    <div
      className="flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
      style={{ width: size, height: size, backgroundColor: bg }}
    >
      {initials}
    </div>
  );
}

function ExpiryBadge({ days }: { days: number }) {
  if (days <= 0)  return <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEE2E2] text-[#991B1B]">Expired</span>;
  if (days <= 7)  return <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEE2E2] text-[#DC2626]">{days}d left</span>;
  if (days <= 30) return <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FED7AA] text-[#C2410C]">{days}d left</span>;
  if (days <= 60) return <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEF3C7] text-[#92400E]">{days}d left</span>;
  return             <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEF9C3] text-[#854D0E]">{days}d left</span>;
}

const SIGNAL_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  prepaid_card:                  { label: 'Prepaid',        bg: '#FEF3C7', color: '#92400E' },
  card_expires_before_trial_end: { label: 'Expires early',  bg: '#FEE2E2', color: '#991B1B' },
  high_radar_score:              { label: 'High Radar',     bg: '#FEE2E2', color: '#7F1D1D' },
};

function RiskSignalBadge({ signal }: { signal: string }) {
  const cfg = SIGNAL_CONFIG[signal] ?? { label: signal, bg: '#FEE2E2', color: '#991B1B' };
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  monitoring:  { label: 'Monitoring',  bg: '#F3F4F6', color: '#6B7280' },
  hold_active: { label: 'Hold Active', bg: '#EDE9FE', color: '#6C63FF' },
  captured:    { label: 'Captured',    bg: '#DCFCE7', color: '#15803D' },
  cancelled:   { label: 'Cancelled',   bg: '#F3F4F6', color: '#6B7280' },
  failed:      { label: 'Failed',      bg: '#FEE2E2', color: '#DC2626' },
  expired:     { label: 'Expired',     bg: '#FEF9C3', color: '#854D0E' },
};

function TrialStatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.monitoring;
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function EmptyState({
  icon, title, body,
}: {
  icon: ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-center px-8">
      {icon}
      <p className="text-[14px] font-semibold text-[#1A1A1A]">{title}</p>
      <p className="text-[13px] text-[#9CA3AF] max-w-xs leading-relaxed">{body}</p>
    </div>
  );
}

function TableHead({
  cols,
  gridTemplateColumns,
}: {
  cols: string[];
  gridTemplateColumns: string;
}) {
  return (
    <div
      className="grid items-center px-5 h-9"
      style={{
        backgroundColor: '#F7F5F2',
        borderBottom: '1px solid #E5E7EB',
        gridTemplateColumns,
      }}
    >
      {cols.map((col) => (
        <span key={col} className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]">
          {col}
        </span>
      ))}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default async function PreventionPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect('/api/auth/signin');

  const params = await searchParams;
  const activeTab: TabId = VALID_TABS.includes(params.tab as TabId)
    ? (params.tab as TabId)
    : 'trial-guard';

  const orgId = session.user.id;
  const now   = new Date();

  let allSubs:     any[]      = [];
  let trialGuards: any[]      = [];
  let livemode                = false;
  let error: string | null    = null;

  try {
    await connectMongo();

    const [rawSubs, rawTrialGuards, connection] = await Promise.all([
      (SubscriptionModel as any)
        .find({ orgId, status: { $in: ['active', 'trialing'] } })
        .lean(),
      (TrialGuardModel as any)
        .find({ orgId })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      (StripeConnectionModel as any)
        .findOne({ userId: orgId })
        .select('livemode')
        .lean(),
    ]);

    livemode = connection?.livemode ?? false;
    allSubs  = rawSubs;

    // Subscription lookup to enrich TrialGuards with fallback customer data
    const subByCustomerId: Record<string, any> = {};
    for (const sub of allSubs) {
      if (sub.stripeCustomerId) subByCustomerId[sub.stripeCustomerId] = sub;
    }

    trialGuards = rawTrialGuards.map((tg: any) => {
      const fb = subByCustomerId[tg.stripeCustomerId];
      return {
        ...tg,
        _id:           tg._id?.toString(),
        orgId:         tg.orgId?.toString(),
        customerEmail: tg.customerEmail  ?? fb?.customerEmail  ?? null,
        customerName:  tg.customerName   ?? fb?.customerName   ?? null,
        cardLast4:     tg.cardLast4      ?? fb?.cardLast4      ?? null,
        cardBrand:     tg.cardBrand      ?? fb?.cardBrand      ?? null,
        cardExpMonth:  tg.cardExpMonth   ?? fb?.cardExpMonth   ?? null,
        cardExpYear:   tg.cardExpYear    ?? fb?.cardExpYear    ?? null,
        cardFunding:   tg.cardFunding    ?? null,
        trialEnd:      tg.trialEnd?.toISOString()    ?? null,
        capturedAt:    tg.capturedAt?.toISOString()  ?? null,
        cancelledAt:   tg.cancelledAt?.toISOString() ?? null,
        failedAt:      tg.failedAt?.toISOString()    ?? null,
        createdAt:     tg.createdAt?.toISOString()   ?? '',
        updatedAt:     tg.updatedAt?.toISOString()   ?? '',
      };
    });
  } catch (err) {
    console.error('[PreventionPage]', err);
    error = 'Failed to load prevention data. Please try again.';
  }

  // ── Derived data ──────────────────────────────────────────────────────────

  // Cards expiring within 90 days, sorted by urgency (most urgent first)
  const expiring90 = allSubs
    .map((sub: any) => {
      const days = getCardExpiryDays(sub.cardExpMonth, sub.cardExpYear, now);
      return days !== null && days >= 0 && days <= 90 ? { ...sub, expiryDays: days } : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => a.expiryDays - b.expiryDays);

  // Shield targets: recoveryScore < 40, sorted by score asc (riskiest first)
  const shieldTargets = allSubs
    .filter((sub: any) => (sub.recoveryScore ?? 100) < 40)
    .sort((a: any, b: any) => (a.recoveryScore ?? 0) - (b.recoveryScore ?? 0));

  // Active high-risk trials (monitoring or hold_active)
  const trialsHighRisk = trialGuards.filter(
    (tg: any) => tg.isHighRisk && ['monitoring', 'hold_active'].includes(tg.status)
  );
  const trialsHold = trialGuards.filter((tg: any) => tg.status === 'hold_active');

  // MRR protected = sum of MRR for subs linked to hold_active / captured TrialGuards
  const protectedSubIds = new Set(
    trialGuards
      .filter((tg: any) => tg.status === 'hold_active' || tg.status === 'captured')
      .map((tg: any) => tg.stripeSubscriptionId)
  );
  const mrrProtected = allSubs
    .filter((sub: any) => protectedSubIds.has(sub.stripeSubscriptionId))
    .reduce((sum: number, sub: any) => sum + (sub.mrr ?? 0), 0);

  // ── Stat card colors ──────────────────────────────────────────────────────

  const expiringColor = expiring90.length  > 0 ? '#DC2626' : '#16A34A';
  const trialsColor   = trialsHighRisk.length > 0 ? '#D97706' : '#16A34A';

  return (
    <div className="flex flex-col p-6 gap-6">

      {/* ── Header ── */}
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-bold text-[#1A1A1A]">Revenue Protection</h1>
        <p className="text-[13px] text-[#4B5563]">3 shields protecting your MRR automatically</p>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-xl p-4 text-[#DC2626] text-sm">
          {error}
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Expiring Soon"
          value={expiring90.length}
          sub="cards at risk in 90 days"
          color={expiringColor}
          icon={<CreditCardIcon size={18} color={expiringColor} />}
        />
        <StatCard
          label="High-Risk Trials"
          value={trialsHighRisk.length}
          sub="trials currently flagged"
          color={trialsColor}
          icon={<ShieldIcon size={18} color={trialsColor} />}
        />
        <StatCard
          label="Shield Targets"
          value={shieldTargets.length}
          sub="customers with score &lt; 40"
          color="#6C63FF"
          icon={<AlertTriangleIcon size={18} color="#6C63FF" />}
        />
        <StatCard
          label="MRR Protected"
          value={formatCurrency(mrrProtected)}
          sub="by SmartCharge holds"
          color="#16A34A"
          icon={<TrendingUpIcon size={18} color="#16A34A" />}
        />
      </div>

      {/* ── Tab navigation ── */}
      <div className="flex gap-2 overflow-x-auto pb-0.5">
        {(
          [
            {
              id:       'trial-guard'       as TabId,
              label:    'Trial Guard',
              count:    trialGuards.length,
              featured: true,
              icon:     'shield',
            },
            {
              id:       'expiring-cards'    as TabId,
              label:    'Expiring Cards',
              count:    expiring90.length,
              featured: false,
              icon:     'card',
            },
            {
              id:       'chargeback-shield' as TabId,
              label:    'Chargeback Shield',
              count:    shieldTargets.length,
              featured: false,
              icon:     'alert',
            },
          ] as const
        ).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <a
              key={tab.id}
              href={`?tab=${tab.id}`}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all flex-shrink-0"
              style={{
                backgroundColor: isActive ? '#6C63FF' : 'white',
                color:           isActive ? 'white' : '#4B5563',
                border:          isActive ? 'none'  : '1px solid #E5E7EB',
                boxShadow:       isActive
                  ? '0 2px 8px rgba(108,99,255,0.35)'
                  : '0 1px 2px rgba(0,0,0,0.05)',
              }}
            >
              {tab.icon === 'shield' && <ShieldIcon       size={15} color={isActive ? 'white' : '#6B7280'} />}
              {tab.icon === 'card'   && <CreditCardIcon   size={15} color={isActive ? 'white' : '#6B7280'} />}
              {tab.icon === 'alert'  && <AlertTriangleIcon size={15} color={isActive ? 'white' : '#6B7280'} />}

              {tab.label}

              {tab.featured && (
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    backgroundColor: isActive ? 'rgba(255,255,255,0.22)' : '#EDE9FE',
                    color:           isActive ? 'white' : '#6C63FF',
                  }}
                >
                  ★
                </span>
              )}

              <span
                className="text-[11px] font-medium px-1.5 py-0.5 rounded-full min-w-[20px] text-center"
                style={{
                  backgroundColor: isActive ? 'rgba(255,255,255,0.18)' : '#F3F4F6',
                  color:           isActive ? 'white' : '#6B7280',
                }}
              >
                {tab.count}
              </span>
            </a>
          );
        })}
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: TRIAL GUARD                                                   */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {activeTab === 'trial-guard' && (
        <div className="flex flex-col gap-4">

          {/* SmartCharge activity banner */}
          {trialsHighRisk.length > 0 && (
            <div
              className="flex items-start gap-3 px-5 py-4 rounded-xl"
              style={{ backgroundColor: '#EEF2FF', borderLeft: '4px solid #6C63FF' }}
            >
              <LockIcon size={20} color="#6C63FF" />
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-[#3730A3]">
                  SmartCharge is active
                </span>
                <span className="text-[12px] text-[#4B5563]">
                  {trialsHighRisk.length} high-risk trial{trialsHighRisk.length > 1 ? 's' : ''} currently flagged
                  {trialsHold.length > 0 && (
                    <> · <strong className="text-[#6C63FF]">{trialsHold.length} pre-auth hold{trialsHold.length > 1 ? 's' : ''} active</strong></>
                  )}
                  {mrrProtected > 0 && (
                    <> · <strong className="text-[#15803D]">{formatCurrency(mrrProtected)} MRR under protection</strong></>
                  )}
                </span>
              </div>
            </div>
          )}

          {/* Trial Guard table */}
          <div
            className="bg-white rounded-xl overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #F0EDE8' }}
          >
            {/* Section header */}
            <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
              <div>
                <h2 className="text-[15px] font-semibold text-[#1A1A1A]">SmartCharge — Trial Guard</h2>
                <p className="text-[12px] text-[#4B5563] mt-0.5">
                  Pre-authorization holds on high-risk trial subscriptions
                </p>
              </div>
              {trialsHold.length > 0 && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-medium flex-shrink-0"
                  style={{ backgroundColor: '#EDE9FE', color: '#6C63FF' }}
                >
                  <LockIcon size={12} color="#6C63FF" />
                  {trialsHold.length} on hold
                </span>
              )}
            </div>

            {trialGuards.length === 0 ? (
              <EmptyState
                icon={<LockIcon size={36} color="#D1D5DB" />}
                title="No trials detected yet"
                body="SmartCharge will automatically flag high-risk trial signups when they occur."
              />
            ) : (
              <div className="overflow-x-auto">
                <TableHead
                  cols={['CUSTOMER', 'RISK SIGNALS', 'CARD', 'TRIAL ENDS', 'STATUS', '']}
                  gridTemplateColumns="1fr 11rem 8rem 7rem 8rem 2.5rem"
                />
                {trialGuards.map((tg: any) => {
                  const trialEndDate = tg.trialEnd ? new Date(tg.trialEnd) : null;
                  const trialEndDays = trialEndDate
                    ? Math.ceil((trialEndDate.getTime() - Date.now()) / 86400000)
                    : null;
                  const score      = computeTrialScore(tg.riskSignals ?? []);
                  const brandLabel = tg.cardBrand
                    ? tg.cardBrand.charAt(0).toUpperCase() + tg.cardBrand.slice(1)
                    : null;
                  const displayName = tg.customerName || tg.customerEmail;

                  return (
                    <div
                      key={tg._id}
                      className="grid items-center px-5 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAF8] transition-colors"
                      style={{
                        gridTemplateColumns: '1fr 11rem 8rem 7rem 8rem 2.5rem',
                        minHeight:     '3.75rem',
                        paddingTop:    '0.625rem',
                        paddingBottom: '0.625rem',
                        borderLeft: tg.isHighRisk
                          ? '3px solid #DC2626'
                          : '3px solid transparent',
                      }}
                    >
                      {/* Customer */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <Avatar
                          name={tg.customerName}
                          email={tg.customerEmail}
                          seed={tg.stripeCustomerId}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
                            {displayName ?? (
                              <span className="font-mono text-[11px] text-[#9CA3AF]">
                                {tg.stripeCustomerId}
                              </span>
                            )}
                          </span>
                          {tg.customerName && tg.customerEmail && (
                            <span className="text-[11px] text-[#9CA3AF] truncate">
                              {tg.customerEmail}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Risk signals + trust score */}
                      <div className="flex flex-col gap-1 items-start">
                        {(tg.riskSignals ?? []).length === 0 ? (
                          <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium bg-[#DCFCE7] text-[#15803D]">
                            Low Risk ✓
                          </span>
                        ) : (
                          <>
                            <div className="flex flex-wrap gap-1">
                              {tg.riskSignals.map((sig: string) => (
                                <RiskSignalBadge key={sig} signal={sig} />
                              ))}
                            </div>
                            <span
                              className="text-[10px] font-bold self-start px-1.5 py-0 rounded"
                              style={{
                                backgroundColor: score <= 25 ? '#FEE2E2' : score <= 60 ? '#FEF3C7' : '#FEF9C3',
                                color:           score <= 25 ? '#991B1B' : score <= 60 ? '#92400E' : '#854D0E',
                              }}
                            >
                              {score}/100
                            </span>
                          </>
                        )}
                      </div>

                      {/* Card */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] text-[#4B5563]">
                          {brandLabel && tg.cardLast4
                            ? `${brandLabel} ····${tg.cardLast4}`
                            : '—'}
                        </span>
                        {tg.cardFunding === 'prepaid' && (
                          <span className="inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-[#FEF3C7] text-[#92400E] self-start">
                            Prepaid ⚠
                          </span>
                        )}
                        {tg.status === 'hold_active' && tg.preAuthAmount && (
                          <span className="text-[10px] text-[#6C63FF] font-medium">
                            ${((tg.preAuthAmount) / 100).toFixed(2)} held
                          </span>
                        )}
                      </div>

                      {/* Trial end */}
                      <div className="flex flex-col gap-0.5">
                        <span
                          className="text-[12px]"
                          style={{
                            color:      trialEndDays !== null && trialEndDays <= 3 ? '#DC2626' : '#4B5563',
                            fontWeight: trialEndDays !== null && trialEndDays <= 3 ? 600      : 400,
                          }}
                        >
                          {tg.trialEnd ? formatDate(tg.trialEnd) : '—'}
                        </span>
                        {trialEndDays !== null && trialEndDays >= 0 && trialEndDays <= 3 && (
                          <span className="text-[10px] font-medium text-[#DC2626]">⚠ Expires soon</span>
                        )}
                      </div>

                      {/* Status */}
                      <div><TrialStatusBadge status={tg.status} /></div>

                      {/* Stripe link */}
                      <a
                        href={getStripeCustomerUrl(tg.stripeCustomerId, livemode)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View in Stripe Dashboard"
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6C63FF] transition-colors"
                      >
                        <ExternalLinkIcon size={14} />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: EXPIRING CARDS                                                */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {activeTab === 'expiring-cards' && (
        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #F0EDE8' }}
        >
          <div className="px-5 py-4 border-b border-[#E5E7EB]">
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Expiring Cards</h2>
            <p className="text-[12px] text-[#4B5563] mt-0.5">
              Cards expiring within the next 90 days · sorted by urgency
            </p>
          </div>

          {expiring90.length === 0 ? (
            <EmptyState
              icon={<CheckCircleIcon size={36} color="#16A34A" />}
              title="No cards expiring soon"
              body="Your customers' payment methods are all in good shape for the next 90 days."
            />
          ) : (
            <div className="overflow-x-auto">
              <TableHead
                cols={['CUSTOMER', 'CARD', 'EXPIRES', 'MRR AT RISK', 'SUBSCRIPTION', '']}
                gridTemplateColumns="1fr 8rem 7rem 7rem 7rem 2.5rem"
              />
              {expiring90.map((sub: any) => {
                const displayName = sub.customerName || sub.customerEmail || sub.stripeCustomerId;
                const brand = sub.cardBrand
                  ? sub.cardBrand.charAt(0).toUpperCase() + sub.cardBrand.slice(1)
                  : null;

                return (
                  <div
                    key={sub._id?.toString()}
                    className="grid items-center px-5 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAF8] transition-colors"
                    style={{
                      gridTemplateColumns: '1fr 8rem 7rem 7rem 7rem 2.5rem',
                      minHeight: '3.5rem',
                      borderLeft: sub.expiryDays <= 30
                        ? '3px solid #DC2626'
                        : '3px solid #D97706',
                    }}
                  >
                    {/* Customer */}
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <Avatar
                        name={sub.customerName}
                        email={sub.customerEmail}
                        seed={sub.stripeCustomerId}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
                          {displayName}
                        </span>
                        {sub.customerName && sub.customerEmail && (
                          <span className="text-[11px] text-[#9CA3AF] truncate">
                            {sub.customerEmail}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Card */}
                    <span className="text-[12px] text-[#4B5563]">
                      {brand && sub.cardLast4 ? `${brand} ····${sub.cardLast4}` : '—'}
                    </span>

                    {/* Expires */}
                    <div>
                      <ExpiryBadge days={sub.expiryDays} />
                    </div>

                    {/* MRR at risk */}
                    <span
                      className="text-[13px] font-semibold"
                      style={{ color: sub.expiryDays <= 30 ? '#DC2626' : '#1A1A1A' }}
                    >
                      {formatCurrency(sub.mrr ?? 0)}
                    </span>

                    {/* Subscription status */}
                    <div><span
                      className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: sub.status === 'active'   ? '#DCFCE7'
                          : sub.status === 'trialing' ? '#EDE9FE'
                          : '#FEF3C7',
                        color: sub.status === 'active'   ? '#15803D'
                          : sub.status === 'trialing' ? '#6C63FF'
                          : '#92400E',
                      }}
                    >
                      {sub.status === 'active'   ? 'Active'
                        : sub.status === 'trialing' ? 'Trialing'
                        : 'At risk'}
                    </span></div>

                    {/* Stripe link */}
                    <a
                      href={getStripeCustomerUrl(sub.stripeCustomerId, livemode)}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="View in Stripe Dashboard"
                      className="flex items-center justify-center w-8 h-8 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6C63FF] transition-colors"
                    >
                      <ExternalLinkIcon size={14} />
                    </a>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* TAB: CHARGEBACK SHIELD                                             */}
      {/* ════════════════════════════════════════════════════════════════════ */}

      {activeTab === 'chargeback-shield' && (
        <div className="flex flex-col gap-4">

          {/* Explanation banner */}
          <div
            className="flex items-start gap-3 px-5 py-4 rounded-xl"
            style={{ backgroundColor: '#FFFBEB', borderLeft: '4px solid #D97706' }}
          >
            <AlertTriangleIcon size={18} color="#D97706" />
            <p className="text-[13px] text-[#92400E] leading-relaxed">
              Customers with a Recovery Score below 40 receive a <strong>pre-debit notification</strong> 24h before each retry attempt — reducing the surprise factor and lowering chargeback risk.
            </p>
          </div>

          <div
            className="bg-white rounded-xl overflow-hidden"
            style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)', border: '1px solid #F0EDE8' }}
          >
            <div className="px-5 py-4 border-b border-[#E5E7EB]">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Chargeback Shield</h2>
              <p className="text-[12px] text-[#4B5563] mt-0.5">
                High-risk customers · Recovery Score &lt; 40
              </p>
            </div>

            {shieldTargets.length === 0 ? (
              <EmptyState
                icon={<CheckCircleIcon size={36} color="#16A34A" />}
                title="No high-risk customers"
                body="Chargeback Shield activates automatically when a customer's Recovery Score drops below 40."
              />
            ) : (
              <div className="overflow-x-auto">
                <TableHead
                  cols={['CUSTOMER', 'RECOVERY SCORE', 'MRR', 'NEXT BILLING', '']}
                  gridTemplateColumns="1fr 10rem 6rem 8rem 2.5rem"
                />
                {shieldTargets.map((sub: any) => {
                  const score      = sub.recoveryScore ?? 0;
                  const periodEnd  = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
                  const billingDays = periodEnd
                    ? Math.ceil((periodEnd.getTime() - now.getTime()) / 86400000)
                    : null;
                  const displayName = sub.customerName || sub.customerEmail || sub.stripeCustomerId;

                  return (
                    <div
                      key={sub._id?.toString()}
                      className="grid items-center px-5 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAF8] transition-colors"
                      style={{
                        gridTemplateColumns: '1fr 10rem 6rem 8rem 2.5rem',
                        minHeight: '3.5rem',
                        borderLeft: score < 20 ? '3px solid #DC2626' : '3px solid #D97706',
                      }}
                    >
                      {/* Customer */}
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <Avatar
                          name={sub.customerName}
                          email={sub.customerEmail}
                          seed={sub.stripeCustomerId}
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
                            {displayName}
                          </span>
                          {sub.customerName && sub.customerEmail && (
                            <span className="text-[11px] text-[#9CA3AF] truncate">
                              {sub.customerEmail}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Recovery Score */}
                      <RecoveryScore score={score} showLabel />

                      {/* MRR */}
                      <span className="text-[13px] font-semibold text-[#1A1A1A]">
                        {formatCurrency(sub.mrr ?? 0)}
                      </span>

                      {/* Next billing */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[12px] text-[#4B5563]">
                          {periodEnd
                            ? periodEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                            : '—'}
                        </span>
                        {billingDays !== null && billingDays >= 0 && billingDays <= 7 && (
                          <span className="text-[10px] font-medium text-[#D97706]">
                            🔔 in {billingDays}d
                          </span>
                        )}
                      </div>

                      {/* Stripe link */}
                      <a
                        href={getStripeCustomerUrl(sub.stripeCustomerId, livemode)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View in Stripe Dashboard"
                        className="flex items-center justify-center w-8 h-8 rounded-lg text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6C63FF] transition-colors"
                      >
                        <ExternalLinkIcon size={14} />
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

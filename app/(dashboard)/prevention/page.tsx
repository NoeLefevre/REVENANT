import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import SubscriptionModel from '@/models/Subscription';
import TrialGuardModel from '@/models/TrialGuard';
import StripeConnectionModel from '@/models/StripeConnection';
import { getStripeCustomerUrl } from '@/libs/stripeUrls';
import { TrialGuard, TrialGuardStatus } from '@/types/revenant';

/** 0–100 trust score for a trial based on its risk signals (lower = riskier). */
function computeTrialScore(riskSignals: string[]): number {
  const weights: Record<string, number> = {
    prepaid_card:                  40,
    card_expires_before_trial_end: 35,
    high_radar_score:              25,
  };
  const deduction = riskSignals.reduce((sum, sig) => sum + (weights[sig] ?? 10), 0);
  return Math.max(0, 100 - deduction);
}

function TrialScoreBadge({ signals }: { signals: string[] }) {
  if (signals.length === 0) return null;
  const score = computeTrialScore(signals);
  const bg    = score <= 25 ? '#FEE2E2' : score <= 60 ? '#FEF3C7' : '#FEF9C3';
  const color = score <= 25 ? '#991B1B' : score <= 60 ? '#92400E' : '#854D0E';
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold"
      style={{ backgroundColor: bg, color }}
      title="Trust score (0 = max risk, 100 = clean)"
    >
      {score}/100
    </span>
  );
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getCardExpiry(sub: any): Date | null {
  if (!sub.cardExpMonth || !sub.cardExpYear) return null;
  return new Date(sub.cardExpYear, sub.cardExpMonth - 1, 28);
}

function CardExpiryBadge({ days }: { days: number }) {
  if (days <= 0) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEE2E2] text-[#991B1B]">
        Expired
      </span>
    );
  }
  if (days <= 7) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEE2E2] text-[#DC2626]">
        {days}d left
      </span>
    );
  }
  if (days <= 14) {
    return (
      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FED7AA] text-[#C2410C]">
        {days}d left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEF9C3] text-[#854D0E]">
      {days}d left
    </span>
  );
}

export default async function PreventionPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  // session.user.id is the User._id (ObjectId as string) — matches orgId in all models
  const orgId = session.user.id;
  const now = new Date();

  let expiring30: any[] = [];
  let expiring14: any[] = [];
  let expiring7: any[] = [];
  let shieldTargets: any[] = [];
  let trialGuards: any[] = [];
  let livemode = false;
  let error: string | null = null;

  try {
    await connectMongo();

    const [allSubs, rawTrialGuards, connection] = await Promise.all([
      (SubscriptionModel as any).find({ orgId, status: { $in: ['active', 'trialing'] } }).lean(),
      (TrialGuardModel as any).find({ orgId }).sort({ createdAt: -1 }).limit(50).lean(),
      (StripeConnectionModel as any).findOne({ userId: orgId }).select('livemode').lean(),
    ]);

    livemode = connection?.livemode ?? false;

    // Build a lookup map from Subscriptions to enrich TrialGuards that lack customer data
    const subByCustomerId: Record<string, any> = {};
    for (const sub of allSubs) {
      if (sub.stripeCustomerId) subByCustomerId[sub.stripeCustomerId] = sub;
    }

    trialGuards = rawTrialGuards.map((tg: any) => {
      const fallback = subByCustomerId[tg.stripeCustomerId];
      return {
        ...tg,
        _id: tg._id?.toString(),
        orgId: tg.orgId?.toString(),
        // Enrich from Subscription if TrialGuard was created before we stored customer data
        customerEmail: tg.customerEmail ?? fallback?.customerEmail ?? null,
        customerName: tg.customerName ?? fallback?.customerName ?? null,
        cardLast4: tg.cardLast4 ?? fallback?.cardLast4 ?? null,
        cardBrand: tg.cardBrand ?? fallback?.cardBrand ?? null,
        cardExpMonth: tg.cardExpMonth ?? fallback?.cardExpMonth ?? null,
        cardExpYear: tg.cardExpYear ?? fallback?.cardExpYear ?? null,
        cardFunding: tg.cardFunding ?? null,
        trialEnd: tg.trialEnd?.toISOString() ?? null,
        capturedAt: tg.capturedAt?.toISOString() ?? null,
        cancelledAt: tg.cancelledAt?.toISOString() ?? null,
        failedAt: tg.failedAt?.toISOString() ?? null,
        createdAt: tg.createdAt?.toISOString() ?? '',
        updatedAt: tg.updatedAt?.toISOString() ?? '',
      };
    });

    // Classify by expiry
    for (const sub of allSubs) {
      const expiry = getCardExpiry(sub);
      if (!expiry) continue;
      const days = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 30 && days >= 0) expiring30.push({ ...sub, expiryDays: days });
      if (days <= 14 && days >= 0) expiring14.push({ ...sub, expiryDays: days });
      if (days <= 7 && days >= 0) expiring7.push({ ...sub, expiryDays: days });
    }

    // Shield targets: low recovery score + billing soon
    shieldTargets = allSubs.filter((sub: any) => {
      const score = sub.recoveryScore ?? 100;
      const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
      const billingInDays = periodEnd
        ? Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : Infinity;
      return score < 40 && billingInDays <= 7;
    });
  } catch (err) {
    console.error('[PreventionPage] Error:', err);
    error = 'Failed to load prevention data. Please try again.';
  }

  const trialsActive   = trialGuards.filter((tg: any) => tg.status === 'monitoring' || tg.status === 'hold_active').length;
  const trialsHighRisk = trialGuards.filter((tg: any) => tg.isHighRisk).length;
  const trialsHold     = trialGuards.filter((tg: any) => tg.status === 'hold_active').length;
  const trialsFailed   = trialGuards.filter((tg: any) => tg.status === 'failed').length;

  const stats = [
    { label: 'Expiring in 30 days', value: expiring30.length, color: '#D97706' },
    { label: 'Expiring in 14 days', value: expiring14.length, color: '#C2410C' },
    { label: 'Expiring in 7 days',  value: expiring7.length,  color: '#DC2626' },
    { label: 'Shield targets',      value: shieldTargets.length, color: '#6C63FF' },
  ];

  return (
    <div className="flex flex-col p-6 gap-6">
      {/* Header */}
      <h1 className="text-[22px] font-bold text-[#1A1A1A]">Prevention</h1>

      {/* Error */}
      {error && (
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-4 text-[#DC2626] text-sm">
          {error}
        </div>
      )}

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map((stat) => (
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

      {/* Expiring Cards section */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        <div className="px-4 py-3 border-b border-[#E5E7EB]">
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Expiring Cards</h2>
          <p className="text-[12px] text-[#4B5563]">Cards expiring within the next 30 days</p>
        </div>

        {/* Table header */}
        <div
          className="grid items-center px-4 h-9"
          style={{
            backgroundColor: '#F7F5F2',
            borderBottom: '1px solid #E5E7EB',
            gridTemplateColumns: '1fr 8rem 6rem 6rem 8rem',
          }}
        >
          {['CUSTOMER', 'CARD', 'EXPIRES', 'MRR', 'ACTION'].map((col) => (
            <span key={col} className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]">
              {col}
            </span>
          ))}
        </div>

        {expiring30.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-[#9CA3AF]">
            No cards expiring in the next 30 days
          </div>
        ) : (
          expiring30.map((sub: any) => {
            const displayName = sub.customerName || sub.customerEmail || sub.stripeCustomerId;
            const brand = sub.cardBrand
              ? sub.cardBrand.charAt(0).toUpperCase() + sub.cardBrand.slice(1)
              : '';
            return (
              <div
                key={sub._id?.toString()}
                className="grid items-center px-4 h-14 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] transition-colors"
                style={{ gridTemplateColumns: '1fr 8rem 6rem 6rem 8rem' }}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{displayName}</span>
                  {sub.customerName && sub.customerEmail && (
                    <span className="text-[11px] text-[#9CA3AF] truncate">{sub.customerEmail}</span>
                  )}
                </div>
                <span className="text-[12px] text-[#4B5563]">
                  {brand} ···{sub.cardLast4 ?? ''}
                </span>
                <div>
                  <CardExpiryBadge days={sub.expiryDays} />
                </div>
                <span className="text-[13px] font-semibold text-[#1A1A1A]">
                  {formatCurrency(sub.mrr ?? 0)}
                </span>
                <button className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-[#4B5563] hover:bg-[#F7F5F2] transition-colors">
                  Send email
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* SmartCharge — Trial Guard section */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        {/* Section header + counters */}
        <div className="px-4 py-3 border-b border-[#E5E7EB] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">SmartCharge — Trial Guard</h2>
            <p className="text-[12px] text-[#4B5563]">
              Pre-authorization holds on high-risk trial subscriptions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[12px] text-[#4B5563]">
              <span className="font-semibold text-[#1A1A1A]">{trialsActive}</span> active
            </span>
            <span className="text-[12px] text-[#4B5563]">
              <span className="font-semibold" style={{ color: trialsHighRisk > 0 ? '#DC2626' : '#1A1A1A' }}>{trialsHighRisk}</span> high-risk
            </span>
            <span className="text-[12px] text-[#4B5563]">
              <span className="font-semibold" style={{ color: trialsHold > 0 ? '#6C63FF' : '#1A1A1A' }}>{trialsHold}</span> on hold
            </span>
            {trialsFailed > 0 && (
              <span className="text-[12px] text-[#DC2626]">
                <span className="font-semibold">{trialsFailed}</span> failed
              </span>
            )}
          </div>
        </div>

        {/* Table header */}
        <div
          className="grid items-center px-4 h-9"
          style={{
            backgroundColor: '#F7F5F2',
            borderBottom: '1px solid #E5E7EB',
            gridTemplateColumns: '1fr 10rem 6rem 7rem 6rem 2.5rem',
          }}
        >
          {['CUSTOMER', 'RISK SIGNALS', 'PRE-AUTH', 'TRIAL ENDS', 'STATUS', ''].map((col) => (
            <span key={col} className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]">
              {col}
            </span>
          ))}
        </div>

        {trialGuards.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-[#9CA3AF]">
            No trial subscriptions tracked yet
          </div>
        ) : (
          trialGuards.map((tg: any) => {
            const statusConfig: Record<string, { bg: string; text: string; label: string }> = {
              monitoring:  { bg: '#F3F4F6', text: '#6B7280', label: 'Surveillance' },
              hold_active: { bg: '#EDE9FE', text: '#6C63FF', label: 'Hold actif 🔒' },
              captured:    { bg: '#DCFCE7', text: '#15803D', label: 'Capturé ✓' },
              cancelled:   { bg: '#F3F4F6', text: '#6B7280', label: 'Annulé' },
              failed:      { bg: '#FEE2E2', text: '#DC2626', label: 'Échoué ✗' },
              expired:     { bg: '#FEF9C3', text: '#854D0E', label: 'Expiré' },
            };
            const sc = statusConfig[tg.status] ?? statusConfig.monitoring;

            const signalConfig: Record<string, { label: string; bg: string; color: string }> = {
              prepaid_card:                  { label: 'Carte prépayée', bg: '#FEF3C7', color: '#92400E' },
              card_expires_before_trial_end: { label: 'Expire avant trial', bg: '#FEE2E2', color: '#991B1B' },
              high_radar_score:              { label: 'Score Radar élevé', bg: '#FEE2E2', color: '#991B1B' },
            };

            const displayName = tg.customerName || tg.customerEmail || null;
            const initials = tg.customerName
              ? tg.customerName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
              : tg.customerEmail
                ? tg.customerEmail.slice(0, 2).toUpperCase()
                : '?';

            const brandLabel = tg.cardBrand
              ? tg.cardBrand.charAt(0).toUpperCase() + tg.cardBrand.slice(1)
              : null;

            const trialEndDate = tg.trialEnd ? new Date(tg.trialEnd) : null;
            const trialEndDays = trialEndDate
              ? Math.ceil((trialEndDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
              : null;

            return (
              <div
                key={tg._id}
                className="grid items-center px-4 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] transition-colors"
                style={{
                  gridTemplateColumns: '1fr 10rem 6rem 7rem 6rem 2.5rem',
                  minHeight: '3.5rem',
                  paddingTop: '0.5rem',
                  paddingBottom: '0.5rem',
                  borderLeft: tg.isHighRisk ? '2px solid #DC2626' : undefined,
                }}
              >
                {/* Customer — avatar + nom/email + carte */}
                <div className="flex items-center gap-2.5 min-w-0 pr-2">
                  <div
                    className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: tg.isHighRisk ? '#DC2626' : '#6C63FF' }}
                  >
                    {initials}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-[13px] font-medium text-[#1A1A1A] truncate">
                      {displayName ?? (
                        <span className="font-mono text-[#9CA3AF]">{tg.stripeCustomerId}</span>
                      )}
                    </span>
                    {displayName && tg.customerEmail && tg.customerName && (
                      <span className="text-[11px] text-[#9CA3AF] truncate">{tg.customerEmail}</span>
                    )}
                    {brandLabel && tg.cardLast4 && (
                      <span className="text-[11px] text-[#6B7280]">
                        {brandLabel} ···{tg.cardLast4}
                        {tg.cardFunding === 'prepaid' && (
                          <span className="ml-1 inline-flex items-center rounded px-1 py-0 text-[10px] font-medium bg-[#FEF3C7] text-[#92400E]">
                            Prépayée ⚠
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                </div>

                {/* Risk signals + trust score */}
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1 flex-wrap">
                    {tg.riskSignals.length === 0 ? (
                      <span className="text-[11px] text-[#9CA3AF]">Aucun</span>
                    ) : (
                      tg.riskSignals.map((sig: string) => {
                        const sc2 = signalConfig[sig] ?? { label: sig, bg: '#FEE2E2', color: '#991B1B' };
                        return (
                          <span
                            key={sig}
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium"
                            style={{ backgroundColor: sc2.bg, color: sc2.color }}
                          >
                            {sc2.label}
                          </span>
                        );
                      })
                    )}
                  </div>
                  {tg.riskSignals.length > 0 && (
                    <TrialScoreBadge signals={tg.riskSignals} />
                  )}
                </div>

                {/* Pre-auth amount */}
                <span className="text-[12px] text-[#4B5563]">
                  {tg.status === 'hold_active' || tg.status === 'captured'
                    ? `$${((tg.preAuthAmount ?? 100) / 100).toFixed(2)}`
                    : '—'}
                </span>

                {/* Trial end */}
                <span
                  className="text-[12px]"
                  style={{
                    color: trialEndDays !== null && trialEndDays <= 3
                      ? '#DC2626'
                      : '#4B5563',
                    fontWeight: trialEndDays !== null && trialEndDays <= 3 ? 600 : 400,
                  }}
                >
                  {tg.trialEnd ? formatDate(tg.trialEnd) : '—'}
                </span>

                {/* Status badge */}
                <div>
                  <span
                    className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
                    style={{ backgroundColor: sc.bg, color: sc.text }}
                  >
                    {sc.label}
                  </span>
                </div>

                {/* Link to Stripe */}
                <a
                  href={getStripeCustomerUrl(tg.stripeCustomerId, livemode)}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Voir dans Stripe Dashboard"
                  className="flex items-center justify-center w-8 h-8 rounded text-[#9CA3AF] hover:bg-[#F3F4F6] hover:text-[#6C63FF] transition-colors"
                >
                  ↗
                </a>
              </div>
            );
          })
        )}
      </div>

      {/* Chargeback Shield section */}
      <div
        className="bg-white rounded-lg overflow-hidden"
        style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
      >
        <div className="px-4 py-3 border-b border-[#E5E7EB]">
          <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Chargeback Shield</h2>
          <p className="text-[12px] text-[#4B5563]">
            High-risk customers billing within 7 days (recovery score &lt; 40)
          </p>
        </div>

        {/* Table header */}
        <div
          className="grid items-center px-4 h-9"
          style={{
            backgroundColor: '#F7F5F2',
            borderBottom: '1px solid #E5E7EB',
            gridTemplateColumns: '1fr 6rem 6rem 7rem',
          }}
        >
          {['CUSTOMER', 'MRR', 'SCORE', 'BILLING DATE'].map((col) => (
            <span key={col} className="text-[10px] font-medium uppercase tracking-[0.8px] text-[#9CA3AF]">
              {col}
            </span>
          ))}
        </div>

        {shieldTargets.length === 0 ? (
          <div className="flex items-center justify-center py-10 text-sm text-[#9CA3AF]">
            No high-risk customers billing this week
          </div>
        ) : (
          shieldTargets.map((sub: any) => {
            const displayName = sub.customerName || sub.customerEmail || sub.stripeCustomerId;
            const score = sub.recoveryScore ?? 0;

            return (
              <div
                key={sub._id?.toString()}
                className="grid items-center px-4 h-14 border-b border-[#E5E7EB] last:border-b-0 hover:bg-[#FAFAFA] transition-colors"
                style={{ gridTemplateColumns: '1fr 6rem 6rem 7rem' }}
              >
                <div className="flex flex-col min-w-0 pr-2">
                  <span className="text-[13px] font-medium text-[#1A1A1A] truncate">{displayName}</span>
                  {sub.customerName && sub.customerEmail && (
                    <span className="text-[11px] text-[#9CA3AF] truncate">{sub.customerEmail}</span>
                  )}
                </div>
                <span className="text-[13px] font-semibold text-[#1A1A1A]">
                  {formatCurrency(sub.mrr ?? 0)}
                </span>
                <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-[#FEE2E2] text-[#991B1B]">
                  {score} /100
                </span>
                <span className="text-[12px] text-[#4B5563]">
                  {formatDate(sub.currentPeriodEnd)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

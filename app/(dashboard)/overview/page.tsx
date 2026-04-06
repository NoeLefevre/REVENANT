import { redirect } from 'next/navigation';
import { Shield, TrendingUp, Mail, Lock } from 'lucide-react';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import InvoiceModel from '@/models/Invoice';
import SubscriptionModel from '@/models/Subscription';
import DunningSequenceModel from '@/models/DunningSequence';
import StripeConnectionModel from '@/models/StripeConnection';
import TrialGuardModel from '@/models/TrialGuard';
import EmailEventModel from '@/models/EmailEvent';
import UserModel from '@/models/User';
import AtRiskBanner from '@/components/revenant/AtRiskBanner';
import MetricCard from '@/components/revenant/MetricCard';
import WarRoomBoard from '@/components/revenant/WarRoomBoard';
import HealthScoreGauge from '@/components/revenant/HealthScoreGauge';
import { Invoice } from '@/types/revenant';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function getStartOfMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function getStartOfLastMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

function getEndOfLastMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
}

function getEndOfThisWeek(): Date {
  const now = new Date();
  const end = new Date(now);
  end.setDate(now.getDate() + (7 - now.getDay()));
  return end;
}

type ActivityType = 'payment_failed' | 'payment_recovered' | 'dunning_started' | 'card_expiry_alert' | 'trial_flagged' | 'trial_captured';

interface ActivityEvent {
  id: string;
  type: ActivityType;
  description: string;
  amount?: number;
  timestamp: string;
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

function activityMeta(type: ActivityType): { icon: string; bg: string; color: string } {
  switch (type) {
    case 'payment_failed':    return { icon: '❌', bg: '#FEE2E2', color: '#DC2626' };
    case 'payment_recovered': return { icon: '✅', bg: '#DCFCE7', color: '#16A34A' };
    case 'dunning_started':   return { icon: '📧', bg: '#FEF3C7', color: '#D97706' };
    case 'card_expiry_alert': return { icon: '⚠️', bg: '#FEF3C7', color: '#D97706' };
    case 'trial_flagged':     return { icon: '🔒', bg: '#EDE9FE', color: '#6C63FF' };
    case 'trial_captured':    return { icon: '🔒', bg: '#EDE9FE', color: '#6C63FF' };
    default:                  return { icon: '•',  bg: '#F3F4F6', color: '#6B7280' };
  }
}

function relativeTime(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 2)        return 'just now';
  if (mins < 60)       return `${mins}m ago`;
  if (mins < 1440)     return `${Math.round(mins / 60)}h ago`;
  return `${Math.round(mins / 1440)}d ago`;
}

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  const orgId = session.user.id;

  let stripeConnection: any = null;
  let openInvoices: Invoice[] = [];
  let protectedMrr = 0;
  let recoveredMrr = 0;
  let recoveredMrrLastMonth = 0;
  let protectedMrrLastMonth = 0;
  let activeSequences = 0;
  let sequencesCompletingThisWeek = 0;
  let smartChargeDetected = 0;
  let smartChargeCaptured = 0;
  let hasAccess = false;
  let activityFeed: ActivityEvent[] = [];
  let error: string | null = null;

  try {
    await connectMongo();

    const [rawConnection, dbUser] = await Promise.all([
      (StripeConnectionModel as any).findOne({ userId: orgId }).lean(),
      (UserModel as any).findById(orgId).select('hasAccess').lean(),
    ]);
    stripeConnection = rawConnection;
    hasAccess = dbUser?.hasAccess ?? false;

    if (stripeConnection) {
      const rawInvoices = await (InvoiceModel as any)
        .find({ orgId, status: 'open' })
        .sort({ recoveryScore: -1 })
        .lean();
      openInvoices = rawInvoices.map(docToInvoice);

      const activeSubs = await (SubscriptionModel as any)
        .find({ orgId, status: 'active' })
        .lean();
      protectedMrr = activeSubs.reduce((sum: number, s: any) => sum + (s.mrr ?? 0), 0);
      protectedMrrLastMonth = protectedMrr - Math.floor(protectedMrr * 0.12);

      const startOfMonth = getStartOfMonth();
      const recoveredThisMonth = await (InvoiceModel as any)
        .find({ orgId, status: 'recovered', recoveredAt: { $gte: startOfMonth } })
        .lean();
      recoveredMrr = recoveredThisMonth.reduce((sum: number, i: any) => sum + (i.amount ?? 0), 0);

      const recoveredLastMonth = await (InvoiceModel as any)
        .find({
          orgId,
          status: 'recovered',
          recoveredAt: { $gte: getStartOfLastMonth(), $lte: getEndOfLastMonth() },
        })
        .lean();
      recoveredMrrLastMonth = recoveredLastMonth.reduce((sum: number, i: any) => sum + (i.amount ?? 0), 0);

      activeSequences = await (DunningSequenceModel as any).countDocuments({
        orgId,
        status: 'active',
      });

      sequencesCompletingThisWeek = await (DunningSequenceModel as any).countDocuments({
        orgId,
        status: 'active',
        steps: { $elemMatch: { scheduledAt: { $lte: getEndOfThisWeek() }, sentAt: { $exists: false } } },
      });

      const [sgDetected, sgCaptured] = await Promise.all([
        (TrialGuardModel as any).countDocuments({
          orgId, isHighRisk: true, createdAt: { $gte: startOfMonth },
        }),
        (TrialGuardModel as any).countDocuments({
          orgId, status: 'captured', createdAt: { $gte: startOfMonth },
        }),
      ]);
      smartChargeDetected = sgDetected;
      smartChargeCaptured = sgCaptured;

      // Activity feed — combine recent events from multiple collections
      const [recentFailed, recentRecovered, recentEmails, recentTrials] = await Promise.all([
        (InvoiceModel as any)
          .find({ orgId, failedAt: { $exists: true } })
          .sort({ failedAt: -1 })
          .limit(5)
          .lean(),
        (InvoiceModel as any)
          .find({ orgId, status: 'recovered', recoveredAt: { $exists: true } })
          .sort({ recoveredAt: -1 })
          .limit(5)
          .lean(),
        (EmailEventModel as any)
          .find({ orgId })
          .sort({ sentAt: -1 })
          .limit(5)
          .lean(),
        (TrialGuardModel as any)
          .find({ orgId, isHighRisk: true })
          .sort({ createdAt: -1 })
          .limit(4)
          .lean(),
      ]);

      const events: ActivityEvent[] = [];

      for (const inv of recentFailed) {
        const name = inv.customerName ?? inv.customerEmail ?? 'Unknown';
        events.push({
          id: `fail-${inv._id}`,
          type: 'payment_failed',
          description: `${name}'s payment failed — ${formatCurrency(inv.amount ?? 0)}`,
          amount: inv.amount,
          timestamp: inv.failedAt?.toISOString() ?? inv.createdAt?.toISOString() ?? '',
        });
      }
      for (const inv of recentRecovered) {
        const name = inv.customerName ?? inv.customerEmail ?? 'Unknown';
        events.push({
          id: `rec-${inv._id}`,
          type: 'payment_recovered',
          description: `${name} recovered — ${formatCurrency(inv.amount ?? 0)}`,
          amount: inv.amount,
          timestamp: inv.recoveredAt?.toISOString() ?? '',
        });
      }
      for (const ev of recentEmails) {
        const isDunning = ev.type?.startsWith('dunning');
        const isExpiry = ev.type?.startsWith('expiry');
        events.push({
          id: `email-${ev._id}`,
          type: isDunning ? 'dunning_started' : isExpiry ? 'card_expiry_alert' : 'dunning_started',
          description: isDunning
            ? `Dunning email sent (step ${ev.step ?? 1})`
            : `Card expiry alert sent`,
          timestamp: ev.sentAt?.toISOString() ?? ev.createdAt?.toISOString() ?? '',
        });
      }
      for (const tg of recentTrials) {
        const isCaptured = tg.status === 'captured';
        events.push({
          id: `tg-${tg._id}`,
          type: isCaptured ? 'trial_captured' : 'trial_flagged',
          description: isCaptured
            ? `High-risk trial captured — ${formatCurrency(tg.preAuthAmount ?? 0)}`
            : `High-risk trial flagged`,
          timestamp: (isCaptured ? tg.capturedAt : tg.createdAt)?.toISOString() ?? '',
        });
      }

      activityFeed = events
        .filter((e) => e.timestamp)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 10);
    }
  } catch (err) {
    console.error('[OverviewPage] Error:', err);
    error = 'Failed to load data. Please try again.';
  }

  if (!stripeConnection) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6">
        <div
          className="bg-white rounded-lg p-8 flex flex-col items-center gap-4 text-center"
          style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8', maxWidth: '400px' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#EDE9FE' }}
          >
            <Shield size={24} color="#6C63FF" />
          </div>
          <h2 className="text-[18px] font-bold text-[#1A1A1A]">Connect your Stripe account</h2>
          <p className="text-sm text-[#4B5563]">
            Connect Stripe to start protecting your MRR from failed payments.
          </p>
          <a
            href="/settings"
            className="w-full py-3 rounded-lg text-white text-sm font-medium text-center"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Connect Stripe →
          </a>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-6 text-[#DC2626]">
          {error}
        </div>
      </div>
    );
  }

  const mrrAtRisk = openInvoices.reduce((sum, inv) => sum + inv.amount, 0);
  const invoicesAtRiskCount = openInvoices.length;
  const temporaryAmount = openInvoices
    .filter((i) => i.dieCategory === 'SOFT_TEMPORARY')
    .reduce((sum, i) => sum + i.amount, 0);
  const updatableAmount = openInvoices
    .filter((i) => i.dieCategory === 'SOFT_UPDATABLE')
    .reduce((sum, i) => sum + i.amount, 0);

  const protectedDelta = protectedMrr - protectedMrrLastMonth;
  const recoveredDelta = recoveredMrr - recoveredMrrLastMonth;
  const trend = invoicesAtRiskCount > 0 ? 12 : 0;

  const highValue    = openInvoices.filter((i) => (i.recoveryScore ?? 0) >= 70);
  const standard     = openInvoices.filter((i) => { const s = i.recoveryScore ?? 0; return s >= 40 && s < 70; });
  const lowPriority  = openInvoices.filter((i) => (i.recoveryScore ?? 0) < 40);

  const hasHealthScore = stripeConnection?.healthScore?.total != null;

  return (
    <div className="flex flex-col">
      {/* At-risk banner */}
      <AtRiskBanner
        amount={mrrAtRisk}
        count={invoicesAtRiskCount}
        temporaryAmount={temporaryAmount}
        updatableAmount={updatableAmount}
        trend={trend}
      />

      <div className="p-6 flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">War Room</h1>
          <p className="text-[13px] text-[#4B5563] mt-1">Your revenue protection command center</p>
        </div>

        {/* Health Score + Metric Cards — side by side on xl */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">

          {/* LEFT — Health Score */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-medium text-[#4B5563]">Revenue Health Score</span>
              {hasAccess ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold"
                  style={{ backgroundColor: '#DCFCE7', color: '#15803D' }}
                >
                  🛡️ Protected
                </span>
              ) : (
                <a
                  href="/onboarding/score"
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[12px] font-semibold transition-opacity hover:opacity-80"
                  style={{ backgroundColor: '#EDE9FE', color: '#6C63FF' }}
                >
                  Activate protection →
                </a>
              )}
            </div>

            {hasHealthScore ? (
              <HealthScoreGauge
                score={stripeConnection.healthScore.total}
                dimensions={stripeConnection.healthScore.dimensions}
                computedAt={stripeConnection.healthScore.computedAt}
              />
            ) : (
              <div
                className="rounded-xl p-6 flex items-center gap-3"
                style={{
                  backgroundColor: '#F7F5F2',
                  border: '1px solid #F0EDE8',
                  minHeight: '180px',
                }}
              >
                <div
                  className="w-2 h-2 rounded-full animate-pulse flex-shrink-0"
                  style={{ backgroundColor: '#6C63FF' }}
                />
                <span className="text-[13px] text-[#4B5563]">
                  Revenue Health Score is being computed…
                </span>
              </div>
            )}
          </div>

          {/* RIGHT — 4 metric cards 2×2 */}
          <div className="grid grid-cols-2 gap-4">
            <MetricCard
              label="Protected MRR"
              value={formatCurrency(protectedMrr)}
              delta={`↑ ${formatCurrency(Math.max(0, protectedDelta))} vs last month`}
              borderColor="#16A34A"
              icon={<Shield size={18} />}
            />
            <MetricCard
              label="Recovered MRR"
              value={formatCurrency(recoveredMrr)}
              delta={`↑ ${formatCurrency(Math.max(0, recoveredDelta))} vs last month`}
              borderColor="#6C63FF"
              icon={<TrendingUp size={18} />}
            />
            <MetricCard
              label="Active Sequences"
              value={`${activeSequences} active`}
              delta={`${sequencesCompletingThisWeek} completing this week`}
              borderColor="#D97706"
              icon={<Mail size={18} />}
            />
            <MetricCard
              label="SmartCharge"
              value={`${smartChargeDetected} trials`}
              delta={`${smartChargeCaptured} high-risk captured`}
              borderColor="#DC2626"
              icon={<Lock size={18} />}
            />
          </div>
        </div>

        {/* War Room */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Failed Invoices</h2>
            <a
              href="/invoices"
              className="text-[13px] font-medium transition-opacity hover:opacity-70"
              style={{ color: '#6C63FF' }}
            >
              View all →
            </a>
          </div>
          <WarRoomBoard
            highValue={highValue}
            standard={standard}
            lowPriority={lowPriority}
          />
        </div>

        {/* Activity Feed */}
        {activityFeed.length > 0 && (
          <div>
            <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-4">Recent Activity</h2>
            <div
              className="bg-white rounded-xl divide-y"
              style={{ border: '1px solid #F0EDE8', boxShadow: '0 1px 3px #00000010' }}
            >
              {activityFeed.map((event) => {
                const { icon, bg, color } = activityMeta(event.type);
                const relTime = relativeTime(event.timestamp);
                return (
                  <div key={event.id} className="flex items-center gap-3 px-4 py-3">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-[14px]"
                      style={{ backgroundColor: bg, color }}
                    >
                      {icon}
                    </div>
                    <span className="text-[13px] text-[#1A1A1A] flex-1 leading-snug">
                      {event.description}
                    </span>
                    <span className="text-[11px] text-[#9CA3AF] whitespace-nowrap">{relTime}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

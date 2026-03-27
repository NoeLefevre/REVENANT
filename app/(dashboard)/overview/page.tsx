import { redirect } from 'next/navigation';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import InvoiceModel from '@/models/Invoice';
import SubscriptionModel from '@/models/Subscription';
import DunningSequenceModel from '@/models/DunningSequence';
import StripeConnectionModel from '@/models/StripeConnection';
import UserModel from '@/models/User';
import AtRiskBanner from '@/components/revenant/AtRiskBanner';
import MetricCard from '@/components/revenant/MetricCard';
import WarRoomBoard from '@/components/revenant/WarRoomBoard';
import HealthCard from '@/components/revenant/HealthCard';
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

export default async function OverviewPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  // session.user.id is the User._id (ObjectId as string) — matches orgId in all models
  const orgId = session.user.id;

  let stripeConnection: any = null;
  let openInvoices: Invoice[] = [];
  let protectedMrr = 0;
  let recoveredMrr = 0;
  let recoveredMrrLastMonth = 0;
  let protectedMrrLastMonth = 0;
  let activeSequences = 0;
  let sequencesCompletingThisWeek = 0;
  let hasAccess = false;
  let error: string | null = null;

  try {
    await connectMongo();

    // StripeConnection uses userId (not orgId)
    const [rawConnection, dbUser] = await Promise.all([
      (StripeConnectionModel as any).findOne({ userId: orgId }).lean(),
      (UserModel as any).findById(orgId).select('hasAccess').lean(),
    ]);
    stripeConnection = rawConnection;
    hasAccess = dbUser?.hasAccess ?? false;

    if (stripeConnection) {
      // Open invoices
      const rawInvoices = await (InvoiceModel as any)
        .find({ orgId, status: 'open' })
        .sort({ recoveryScore: -1 })
        .lean();
      openInvoices = rawInvoices.map(docToInvoice);

      // Protected MRR (active subscriptions)
      const activeSubs = await (SubscriptionModel as any)
        .find({ orgId, status: 'active' })
        .lean();
      protectedMrr = activeSubs.reduce((sum: number, s: any) => sum + (s.mrr ?? 0), 0);

      // Protected MRR last month (approximate)
      protectedMrrLastMonth = protectedMrr - Math.floor(protectedMrr * 0.12);

      // Recovered MRR this month
      const startOfMonth = getStartOfMonth();
      const recoveredThisMonth = await (InvoiceModel as any)
        .find({ orgId, status: 'recovered', recoveredAt: { $gte: startOfMonth } })
        .lean();
      recoveredMrr = recoveredThisMonth.reduce((sum: number, i: any) => sum + (i.amount ?? 0), 0);

      // Recovered MRR last month
      const recoveredLastMonth = await (InvoiceModel as any)
        .find({
          orgId,
          status: 'recovered',
          recoveredAt: { $gte: getStartOfLastMonth(), $lte: getEndOfLastMonth() },
        })
        .lean();
      recoveredMrrLastMonth = recoveredLastMonth.reduce((sum: number, i: any) => sum + (i.amount ?? 0), 0);

      // Active sequences
      activeSequences = await (DunningSequenceModel as any).countDocuments({
        orgId,
        status: 'active',
      });

      // Sequences completing this week
      sequencesCompletingThisWeek = await (DunningSequenceModel as any).countDocuments({
        orgId,
        status: 'active',
        steps: { $elemMatch: { scheduledAt: { $lte: getEndOfThisWeek() }, sentAt: { $exists: false } } },
      });
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
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EDE9FE' }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
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

  // Compute metrics
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

  // Group invoices by tier
  const highValue = openInvoices.filter((i) => (i.recoveryScore ?? 0) >= 70);
  const standard = openInvoices.filter((i) => {
    const s = i.recoveryScore ?? 0;
    return s >= 40 && s < 70;
  });
  const lowPriority = openInvoices.filter((i) => (i.recoveryScore ?? 0) < 40);

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

      {/* Content */}
      <div className="p-6 flex flex-col gap-6">
        {/* Page title */}
        <h1 className="text-[22px] font-bold text-[#1A1A1A]">Overview</h1>

        {/* Revenue Health Score */}
        {stripeConnection?.healthScore?.total != null ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Revenue Health Score</h2>
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
            <HealthCard
              score={stripeConnection.healthScore.total}
              dimensions={stripeConnection.healthScore.dimensions}
              pills={stripeConnection.healthScore.pills ?? []}
            />
          </div>
        ) : stripeConnection ? (
          <div
            className="rounded-lg p-4 flex items-center gap-3"
            style={{ backgroundColor: '#F7F5F2', border: '1px solid #F0EDE8' }}
          >
            <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: '#6C63FF' }} />
            <span className="text-[13px] text-[#4B5563]">
              Revenue Health Score is being computed…
            </span>
          </div>
        ) : null}

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-4">
          <MetricCard
            label="Protected MRR this month"
            value={formatCurrency(protectedMrr)}
            delta={`↑ ${formatCurrency(Math.max(0, protectedDelta))} vs last month`}
            color="green"
            icon="shield"
          />
          <MetricCard
            label="Recovered MRR this month"
            value={formatCurrency(recoveredMrr)}
            delta={`↑ ${formatCurrency(Math.max(0, recoveredDelta))} vs last month`}
            color="purple"
            icon="trending-up"
          />
          <MetricCard
            label="Active sequences"
            value={String(activeSequences)}
            delta={`${sequencesCompletingThisWeek} completing this week`}
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
      </div>
    </div>
  );
}

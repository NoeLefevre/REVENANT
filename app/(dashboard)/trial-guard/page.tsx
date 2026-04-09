import { redirect } from 'next/navigation';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import SubscriptionModel from '@/models/Subscription';
import StripeConnectionModel from '@/models/StripeConnection';

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string | null }) {
  const map: Record<string, { label: string; bg: string; color: string }> = {
    held:      { label: 'Hold active',  bg: '#EDE9FE', color: '#6C63FF' },
    pending:   { label: '3DS pending',  bg: '#FEF3C7', color: '#D97706' },
    captured:  { label: 'Converted',    bg: '#DCFCE7', color: '#15803D' },
    cancelled: { label: 'Cancelled',    bg: '#F3F4F6', color: '#6B7280' },
    failed:    { label: 'Blocked',      bg: '#FEE2E2', color: '#DC2626' },
  };
  const s = status ?? '';
  const cfg = map[s] ?? { label: s || '—', bg: '#F3F4F6', color: '#6B7280' };
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}
    >
      {cfg.label}
    </span>
  );
}

function MetricCard({
  label, value, sub, borderColor,
}: {
  label: string; value: string | number; sub?: string; borderColor: string;
}) {
  return (
    <div
      className="bg-white rounded-xl p-5 flex flex-col gap-1"
      style={{ border: `1.5px solid ${borderColor}20`, boxShadow: '0 1px 3px #00000010' }}
    >
      <span className="text-[12px] text-[#6B7280] font-medium uppercase tracking-wide">{label}</span>
      <span className="text-[28px] font-bold text-[#1A1A1A] leading-none">{value}</span>
      {sub && <span className="text-[12px] text-[#9CA3AF]">{sub}</span>}
      <div className="mt-2 h-0.5 rounded-full" style={{ backgroundColor: borderColor, opacity: 0.3 }} />
    </div>
  );
}

export default async function TrialGuardPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  const orgId = session.user.id;
  let connection: any = null;
  let counters = { trialsProtectedThisMonth: 0, badCardsBlocked: 0, conversionsSucceeded: 0, activeHolds: 0 };
  let activeTrials: any[] = [];

  try {
    await connectMongo();

    connection = await (StripeConnectionModel as any).findOne({ userId: orgId }).lean();
    if (!connection) {
      redirect('/onboarding');
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      trialsProtectedThisMonth,
      badCardsBlocked,
      conversionsSucceeded,
      activeHolds,
      rawActiveTrials,
    ] = await Promise.all([
      (SubscriptionModel as any).countDocuments({ orgId, trialGuardEnabled: true, createdAt: { $gte: startOfMonth } }),
      (SubscriptionModel as any).countDocuments({ orgId, paymentIntentStatus: 'failed', createdAt: { $gte: startOfMonth } }),
      (SubscriptionModel as any).countDocuments({ orgId, paymentIntentStatus: 'captured', createdAt: { $gte: startOfMonth } }),
      (SubscriptionModel as any).countDocuments({ orgId, paymentIntentStatus: 'held' }),
      (SubscriptionModel as any)
        .find({ orgId, trialGuardEnabled: true })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),
    ]);

    counters = { trialsProtectedThisMonth, badCardsBlocked, conversionsSucceeded, activeHolds };
    activeTrials = rawActiveTrials;
  } catch (err) {
    console.error('[TrialGuardPage]', err);
  }

  const modeLabel = connection?.trialGuardMode === 'selective' ? 'Selective' : 'Universal';
  const modeColor = connection?.trialGuardMode === 'selective' ? '#D97706' : '#6C63FF';

  return (
    <div className="p-6 flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">Trial Guard</h1>
          <p className="text-[13px] text-[#4B5563] mt-1">
            Every trial is backed by a real payment.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] text-[#6B7280]">Mode</span>
          <span
            className="px-2.5 py-1 rounded-full text-[12px] font-semibold"
            style={{ backgroundColor: `${modeColor}18`, color: modeColor }}
          >
            {modeLabel}
          </span>
          <a
            href="/settings?section=trial-guard"
            className="text-[12px] font-medium underline transition-opacity hover:opacity-70"
            style={{ color: '#6C63FF' }}
          >
            Change
          </a>
        </div>
      </div>

      {/* 4 Counters */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Trials protected"
          value={counters.trialsProtectedThisMonth}
          sub="this month"
          borderColor="#6C63FF"
        />
        <MetricCard
          label="Bad cards blocked"
          value={counters.badCardsBlocked}
          sub="this month"
          borderColor="#DC2626"
        />
        <MetricCard
          label="Conversions secured"
          value={counters.conversionsSucceeded}
          sub="this month"
          borderColor="#15803D"
        />
        <MetricCard
          label="Active holds"
          value={counters.activeHolds}
          sub="trials in progress"
          borderColor="#D97706"
        />
      </div>

      {/* Trials table */}
      <div>
        <h2 className="text-[15px] font-semibold text-[#1A1A1A] mb-3">Recent trials</h2>
        <div
          className="bg-white rounded-xl overflow-hidden"
          style={{ border: '1px solid #F0EDE8', boxShadow: '0 1px 3px #00000010' }}
        >
          {activeTrials.length === 0 ? (
            <div className="p-8 text-center text-[13px] text-[#9CA3AF]">
              No trials tracked yet. Trial Guard activates automatically on new signups.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr style={{ borderBottom: '1px solid #F0EDE8' }}>
                  <th className="text-left px-4 py-3 text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">Customer</th>
                  <th className="text-left px-4 py-3 text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">Amount held</th>
                  <th className="text-left px-4 py-3 text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">Risk signals</th>
                  <th className="text-left px-4 py-3 text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-3 text-[11px] text-[#9CA3AF] font-medium uppercase tracking-wide">Hold expires</th>
                </tr>
              </thead>
              <tbody>
                {activeTrials.map((trial: any) => {
                  const label = trial.customerName ?? trial.customerEmail ?? trial.stripeCustomerId ?? '—';
                  const signals: string[] = trial.riskSignals ?? [];
                  const signalMap: Record<string, string> = {
                    prepaid_card: 'Prepaid',
                    card_expires_before_trial_end: 'Expiry',
                    high_radar_score: 'Radar',
                  };
                  return (
                    <tr
                      key={trial._id?.toString()}
                      style={{ borderBottom: '1px solid #F9F7F5' }}
                    >
                      <td className="px-4 py-3 text-[#1A1A1A] font-medium">
                        {label}
                        {trial.customerEmail && trial.customerName && (
                          <div className="text-[11px] text-[#9CA3AF] font-normal">{trial.customerEmail}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[#1A1A1A]">
                        {trial.holdAmount ? formatCurrency(trial.holdAmount) : '—'}
                      </td>
                      <td className="px-4 py-3">
                        {signals.length === 0 ? (
                          <span className="text-[#9CA3AF]">None</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {signals.map((s) => (
                              <span
                                key={s}
                                className="px-1.5 py-0.5 rounded text-[10px] font-medium"
                                style={{ backgroundColor: '#FEF3C7', color: '#D97706' }}
                              >
                                {signalMap[s] ?? s}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={trial.paymentIntentStatus} />
                      </td>
                      <td className="px-4 py-3 text-[#6B7280]">
                        {formatDate(trial.holdExpiresAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

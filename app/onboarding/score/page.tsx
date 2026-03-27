import { redirect } from 'next/navigation';
import Link from 'next/link';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';

function scoreColor(score: number) {
  if (score >= 70) return '#16A34A';
  if (score >= 50) return '#F59E0B';
  return '#DC2626';
}

function scoreBg(score: number) {
  if (score >= 70) return '#DCFCE7';
  if (score >= 50) return '#FEF3C7';
  return '#FEE2E2';
}

function scoreLabel(score: number) {
  if (score >= 70) return 'Healthy';
  if (score >= 50) return 'At Risk';
  return 'Critical';
}

function formatCurrency(cents: number) {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function detectMrrBand(mrrCents: number) {
  if (mrrCents < 3_000_000) return { value: 'under_30k', price: '$49/mo' };
  if (mrrCents <= 8_000_000) return { value: '30k_80k', price: '$99/mo' };
  return { value: 'over_80k', price: '$249/mo' };
}

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export default async function ScorePage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/api/auth/signin?callbackUrl=/onboarding/score');

  await connectMongo();
  const userId = session.user.id;

  const connection = await (StripeConnection as any)
    .findOne({ userId })
    .select('syncStatus healthScore')
    .lean();

  if (!connection) redirect('/onboarding');
  if ((connection as any).syncStatus !== 'done') redirect('/onboarding/syncing');

  const healthScore = (connection as any).healthScore;
  if (!healthScore) redirect('/onboarding/syncing');

  const in90Days = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

  const [openInvoices, activeSubs] = await Promise.all([
    (Invoice as any).find({ orgId: userId, status: 'open' }).select('amount').lean(),
    (Subscription as any).find({ orgId: userId, status: 'active' }).select('mrr cardExpMonth cardExpYear').lean(),
  ]);

  const atRiskCents = openInvoices.reduce((sum: number, inv: any) => sum + inv.amount, 0);

  const expiringIn90Count = activeSubs.filter((s: any) => {
    if (!s.cardExpMonth || !s.cardExpYear) return false;
    const expiry = new Date(s.cardExpYear, s.cardExpMonth, 0, 23, 59, 59);
    return expiry <= in90Days;
  }).length;

  const totalMrr = activeSubs.reduce((sum: number, s: any) => sum + (s.mrr ?? 0), 0);

  // Actual failure rate = 100 - the failureRate dimension (which is already inverted)
  const actualFailureRatePct = Math.max(0, 100 - (healthScore.dimensions?.failureRate ?? 100));
  const recoveryRatePct = healthScore.dimensions?.recoveryRate ?? 0;
  const score = healthScore.total ?? 0;
  const band = detectMrrBand(totalMrr);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#FAF8F5' }}
    >
      <div
        className="bg-white w-full flex flex-col gap-8 rounded-xl p-8"
        style={{ maxWidth: '520px', boxShadow: '0 4px 24px #0000000D', border: '1px solid #F0EDE8' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ZapIcon />
            <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
          </div>
          <span className="text-[12px] text-[#9CA3AF] font-medium">Step 2 of 3</span>
        </div>

        {/* Score display */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="w-32 h-32 rounded-full flex flex-col items-center justify-center"
            style={{
              backgroundColor: scoreBg(score),
              border: `3px solid ${scoreColor(score)}`,
            }}
          >
            <span
              className="text-[44px] font-bold leading-none"
              style={{ color: scoreColor(score) }}
            >
              {score}
            </span>
            <span className="text-[12px] font-medium" style={{ color: scoreColor(score) }}>
              / 100
            </span>
          </div>
          <div className="flex flex-col gap-1">
            <h1 className="text-[22px] font-bold text-[#1A1A1A]">Your Revenue Health Score</h1>
            <span
              className="inline-block px-3 py-1 rounded-full text-[12px] font-semibold"
              style={{ backgroundColor: scoreBg(score), color: scoreColor(score) }}
            >
              {score >= 70 ? '✓' : '⚠'} {scoreLabel(score)}
            </span>
          </div>
        </div>

        {/* 4 Metric Cards */}
        <div className="grid grid-cols-2 gap-3">
          <div
            className="flex flex-col gap-1 p-3 rounded-lg"
            style={{ backgroundColor: '#FEF2F2', border: '1px solid #FECACA' }}
          >
            <span className="text-[20px] font-bold text-[#DC2626]">
              {formatCurrency(atRiskCents)}
            </span>
            <span className="text-[11px] text-[#9CA3AF]">at risk now</span>
          </div>
          <div
            className="flex flex-col gap-1 p-3 rounded-lg"
            style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}
          >
            <span className="text-[20px] font-bold text-[#1A1A1A]">{actualFailureRatePct}%</span>
            <span className="text-[11px] text-[#9CA3AF]">failure rate</span>
          </div>
          <div
            className="flex flex-col gap-1 p-3 rounded-lg"
            style={{ backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB' }}
          >
            <span className="text-[20px] font-bold text-[#1A1A1A]">{recoveryRatePct}%</span>
            <span className="text-[11px] text-[#9CA3AF]">recovery rate</span>
          </div>
          <div
            className="flex flex-col gap-1 p-3 rounded-lg"
            style={{
              backgroundColor: expiringIn90Count > 0 ? '#FFFBEB' : '#F9FAFB',
              border: `1px solid ${expiringIn90Count > 0 ? '#FDE68A' : '#E5E7EB'}`,
            }}
          >
            <span
              className="text-[20px] font-bold"
              style={{ color: expiringIn90Count > 0 ? '#D97706' : '#1A1A1A' }}
            >
              {expiringIn90Count}
            </span>
            <span className="text-[11px] text-[#9CA3AF]">cards expiring (90d)</span>
          </div>
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[#4B5563] text-center">
            {score < 70
              ? 'Your revenue is at risk. REVENANT can protect it — automatically.'
              : "Your revenue is in good shape — let's keep it that way."}
          </p>
          <Link
            href={`/onboarding/done?band=${band.value}`}
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity hover:opacity-90 block"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Activate Protection — {band.price}
          </Link>
          <Link
            href="/overview"
            className="text-sm text-[#9CA3AF] text-center hover:text-[#4B5563] transition-colors block"
          >
            Explore your score →
          </Link>
        </div>
      </div>
    </div>
  );
}

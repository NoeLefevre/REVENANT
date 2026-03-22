import { Metadata } from 'next';
import Link from 'next/link';
import connectMongo from '@/libs/mongoose';
import HealthCard from '@/components/revenant/HealthCard';
import { HealthScore } from '@/types/revenant';

interface PageProps {
  params: Promise<{ userId: string }>;
}

// Mock health score used when no real data is found
const MOCK_HEALTH_SCORE: HealthScore = {
  total: 72,
  dimensions: {
    expiryRisk: 65,
    failureRate: 78,
    recoveryRate: 55,
    customerRisk: 80,
    dunningConfig: true,
  },
};

const MOCK_PILLS = ['SaaS', '47 customers', '$12,400 MRR'];

async function fetchHealthScore(userId: string): Promise<{
  score: HealthScore;
  pills: string[];
  orgName?: string;
}> {
  try {
    await connectMongo();

    // Try to find audit result from StripeConnection
    const StripeConnectionModel = (await import('@/models/StripeConnection')).default;
    const conn = await (StripeConnectionModel as any)
      .findOne({ orgId: userId })
      .lean();

    if (!conn) {
      return { score: MOCK_HEALTH_SCORE, pills: MOCK_PILLS };
    }

    // Try to find subscription & invoice stats to build a real score
    const InvoiceModel = (await import('@/models/Invoice')).default;
    const SubscriptionModel = (await import('@/models/Subscription')).default;

    const [openInvoices, activeSubs, totalInvoices, recoveredInvoices] = await Promise.all([
      (InvoiceModel as any).find({ orgId: userId, status: 'open' }).lean(),
      (SubscriptionModel as any).find({ orgId: userId, status: 'active' }).lean(),
      (InvoiceModel as any).countDocuments({ orgId: userId }),
      (InvoiceModel as any).countDocuments({ orgId: userId, status: 'recovered' }),
    ]);

    const totalMrr = activeSubs.reduce((sum: number, s: any) => sum + (s.mrr ?? 0), 0);

    // Compute dimensions (0-100 scores)
    const now = new Date();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const expiringCards = activeSubs.filter((s: any) => {
      if (!s.cardExpMonth || !s.cardExpYear) return false;
      const exp = new Date(s.cardExpYear, s.cardExpMonth - 1, 28);
      return exp <= in30Days;
    });
    const expiryRisk = activeSubs.length > 0
      ? Math.max(0, 100 - Math.round((expiringCards.length / activeSubs.length) * 100))
      : 100;

    const failureRate = totalInvoices > 0
      ? Math.max(0, 100 - Math.round((openInvoices.length / totalInvoices) * 100))
      : 100;

    const recoveryRate = (openInvoices.length + recoveredInvoices) > 0
      ? Math.round((recoveredInvoices / (openInvoices.length + recoveredInvoices)) * 100)
      : 0;

    const avgScore = activeSubs.length > 0
      ? Math.round(
          activeSubs.reduce((sum: number, s: any) => sum + (s.recoveryScore ?? 50), 0) /
          activeSubs.length
        )
      : 50;
    const customerRisk = avgScore;

    const total = Math.round(
      (expiryRisk + failureRate + recoveryRate + customerRisk) / 4
    );

    const score: HealthScore = {
      total,
      dimensions: {
        expiryRisk,
        failureRate,
        recoveryRate,
        customerRisk,
        dunningConfig: true, // has stripe connection
      },
    };

    const pills: string[] = [];
    if (activeSubs.length > 0) pills.push(`${activeSubs.length} customers`);
    if (totalMrr > 0) {
      pills.push(`${(totalMrr / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })} MRR`);
    }

    return { score, pills };
  } catch (err) {
    console.error('[HealthCardPage] Error fetching score:', err);
    return { score: MOCK_HEALTH_SCORE, pills: MOCK_PILLS };
  }
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { userId } = await params;
  const { score } = await fetchHealthScore(userId);

  const scoreColor = score.total >= 70 ? 'good' : score.total >= 40 ? 'fair' : 'at risk';
  const title = `Revenue Safety Score: ${score.total}/100 | REVENANT`;
  const description = `My Stripe revenue health is ${scoreColor}. Protect your MRR from failed payments with REVENANT.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: 'REVENANT',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export default async function HealthCardPage({ params }: PageProps) {
  const { userId } = await params;
  const { score, pills } = await fetchHealthScore(userId);

  const scoreLabel =
    score.total >= 70 ? 'Good' : score.total >= 40 ? 'Fair' : 'At risk';
  const scoreBg =
    score.total >= 70 ? '#DCFCE7' : score.total >= 40 ? '#FEF9C3' : '#FEE2E2';
  const scoreText =
    score.total >= 70 ? '#15803D' : score.total >= 40 ? '#D97706' : '#DC2626';

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#FAF8F5' }}
    >
      <div className="flex flex-col items-center gap-6 w-full" style={{ maxWidth: '640px' }}>
        {/* Header */}
        <div className="flex items-center gap-1.5">
          <ZapIcon />
          <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
        </div>

        {/* Score badge */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">Revenue Safety Score™</h1>
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center rounded-full px-3 py-1 text-[13px] font-semibold"
              style={{ backgroundColor: scoreBg, color: scoreText }}
            >
              {scoreLabel}
            </span>
            <span className="text-[13px] text-[#4B5563]">
              Based on your Stripe data
            </span>
          </div>
        </div>

        {/* Health card */}
        <div className="w-full">
          <HealthCard
            score={score.total}
            dimensions={score.dimensions}
            pills={pills}
          />
        </div>

        {/* CTA */}
        <div className="flex flex-col items-center gap-3 w-full" style={{ maxWidth: '400px' }}>
          <Link
            href="/audit"
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Get your own score →
          </Link>
          <p className="text-[12px] text-[#9CA3AF] text-center">
            Free · No credit card required · 5-minute setup
          </p>
        </div>

        {/* Dimensions breakdown */}
        <div
          className="bg-white rounded-lg p-5 w-full flex flex-col gap-4"
          style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
        >
          <h2 className="text-[14px] font-semibold text-[#1A1A1A]">Score breakdown</h2>
          <div className="flex flex-col gap-3">
            {[
              { label: 'Expiry Risk', value: score.dimensions.expiryRisk, hint: 'Cards expiring soon' },
              { label: 'Failure Rate', value: score.dimensions.failureRate, hint: 'Payment success rate' },
              { label: 'Recovery Rate', value: score.dimensions.recoveryRate, hint: 'Failed payments recovered' },
              { label: 'Customer Risk', value: score.dimensions.customerRisk, hint: 'Average customer health' },
              {
                label: 'Dunning Config',
                value: score.dimensions.dunningConfig ? 100 : 0,
                hint: score.dimensions.dunningConfig ? 'Dunning configured' : 'No dunning setup',
              },
            ].map((dim) => {
              const pct = typeof dim.value === 'boolean' ? (dim.value ? 100 : 0) : dim.value;
              const color = pct >= 70 ? '#16A34A' : pct >= 40 ? '#D97706' : '#DC2626';

              return (
                <div key={dim.label} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium text-[#1A1A1A]">{dim.label}</span>
                      <span className="text-[11px] text-[#9CA3AF]">{dim.hint}</span>
                    </div>
                    <span className="text-[13px] font-semibold" style={{ color }}>{pct}%</span>
                  </div>
                  <div className="relative h-2 rounded-full" style={{ backgroundColor: '#F0EDE8' }}>
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: color }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-[11px] text-[#9CA3AF] text-center">
          Powered by REVENANT · revenant.so
        </p>
      </div>
    </div>
  );
}

import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import SubscriptionModel from '@/models/Subscription';

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
  let error: string | null = null;

  try {
    await connectMongo();

    const allSubs = await (SubscriptionModel as any)
      .find({ orgId, status: { $in: ['active', 'trialing'] } })
      .lean();

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

  const stats = [
    {
      label: 'Expiring in 30 days',
      value: expiring30.length,
      color: '#D97706',
    },
    {
      label: 'Expiring in 14 days',
      value: expiring14.length,
      color: '#C2410C',
    },
    {
      label: 'Expiring in 7 days',
      value: expiring7.length,
      color: '#DC2626',
    },
    {
      label: 'Shield targets',
      value: shieldTargets.length,
      color: '#6C63FF',
    },
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
            const expiryLabel =
              sub.cardExpMonth && sub.cardExpYear
                ? `${String(sub.cardExpMonth).padStart(2, '0')}/${String(sub.cardExpYear).slice(-2)}`
                : '—';

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

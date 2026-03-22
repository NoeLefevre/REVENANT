import Link from 'next/link';

// Mock data for audit page — real Stripe scan will be implemented later
const MOCK_DATA = {
  atRisk: 4320_00, // cents
  failedPayments: 3,
  cardsExpiring: 5,
  chargebackRisk: 2,
};

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

export const metadata = {
  title: 'Revenue Health Audit | REVENANT',
  description: 'See how much revenue is currently at risk in your Stripe account.',
};

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

interface MiniCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  sub: string;
  accentColor: string;
  accentBg: string;
}

function MiniCard({ icon, label, value, sub, accentColor, accentBg }: MiniCardProps) {
  return (
    <div
      className="bg-white rounded-lg p-4 flex items-start gap-3"
      style={{ border: '1px solid #F0EDE8', boxShadow: '0 1px 3px #00000010' }}
    >
      <div
        className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg"
        style={{ backgroundColor: accentBg }}
      >
        {icon}
      </div>
      <div className="flex flex-col">
        <span className="text-[12px] text-[#4B5563]">{label}</span>
        <span className="text-[20px] font-bold" style={{ color: accentColor }}>
          {value}
        </span>
        <span className="text-[11px] text-[#9CA3AF]">{sub}</span>
      </div>
    </div>
  );
}

export default function AuditPage() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#FAF8F5' }}
    >
      {/* Card */}
      <div
        className="bg-white w-full flex flex-col gap-6 rounded-xl p-8"
        style={{
          maxWidth: '560px',
          boxShadow: '0 4px 24px #0000000D',
          border: '1px solid #F0EDE8',
        }}
      >
        {/* Logo + step */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ZapIcon />
            <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
          </div>
          <span className="text-[12px] text-[#9CA3AF] font-medium">Step 1 of 3</span>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-2 text-center">
          <p className="text-sm text-[#4B5563]">Currently at risk in your Stripe</p>
          <p className="text-[56px] font-bold leading-none" style={{ color: '#DC2626' }}>
            {formatCurrency(MOCK_DATA.atRisk)}
          </p>
          <p className="text-sm text-[#4B5563] max-w-xs mx-auto">
            This is revenue that could be automatically recovered with intelligent dunning and card update campaigns.
          </p>
        </div>

        {/* Mini cards */}
        <div className="flex flex-col gap-3">
          <MiniCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="9" y1="15" x2="15" y2="15" />
              </svg>
            }
            label="Failed payments"
            value={MOCK_DATA.failedPayments}
            sub="invoices requiring recovery"
            accentColor="#DC2626"
            accentBg="#FEF2F2"
          />
          <MiniCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                <line x1="1" y1="10" x2="23" y2="10" />
              </svg>
            }
            label="Cards expiring soon"
            value={MOCK_DATA.cardsExpiring}
            sub="subscriptions at risk of failing"
            accentColor="#D97706"
            accentBg="#FEF9C3"
          />
          <MiniCard
            icon={
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            }
            label="Chargeback risk"
            value={MOCK_DATA.chargebackRisk}
            sub="high-risk customers billing soon"
            accentColor="#6C63FF"
            accentBg="#EDE9FE"
          />
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <a
            href="/api/auth/signin?callbackUrl=/overview"
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Activate REVENANT →
          </a>
          <Link
            href="/overview"
            className="text-sm text-[#4B5563] text-center hover:text-[#1A1A1A] transition-colors"
          >
            Explore dashboard first →
          </Link>
        </div>

        {/* Footer */}
        <p className="text-[11px] text-[#9CA3AF] text-center">
          No credit card required · 5-minute setup · Cancel anytime
        </p>
      </div>
    </div>
  );
}

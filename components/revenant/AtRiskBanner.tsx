interface AtRiskBannerProps {
  amount: number;
  count: number;
  temporaryAmount: number;
  updatableAmount: number;
  trend: number;
}

function formatCurrency(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export default function AtRiskBanner({
  amount,
  count,
  temporaryAmount,
  updatableAmount,
  trend,
}: AtRiskBannerProps) {
  return (
    <div
      className="flex items-center justify-between h-16 px-4"
      style={{
        backgroundColor: '#FEF2F2',
        borderBottom: '1px solid #FECACA',
      }}
    >
      {/* Left */}
      <div className="flex items-baseline gap-2">
        <span className="text-[22px] font-bold text-[#DC2626]">{formatCurrency(amount)}</span>
        <span className="text-sm text-[#4B5563]">across {count} invoice{count !== 1 ? 's' : ''}</span>
      </div>

      {/* Center */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: '#FEF9C3', color: '#854D0E' }}
        >
          Temporary&nbsp;
          <strong>{formatCurrency(temporaryAmount)}</strong>
        </span>
        <span
          className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium"
          style={{ backgroundColor: '#FED7AA', color: '#C2410C' }}
        >
          Card update&nbsp;
          <strong>{formatCurrency(updatableAmount)}</strong>
        </span>
      </div>

      {/* Right */}
      <div className="text-sm text-[#DC2626] font-medium">
        ↑ {Math.abs(trend)}% vs last month
      </div>
    </div>
  );
}

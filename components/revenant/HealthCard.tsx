import { HealthScore } from '@/types/revenant';

interface HealthCardProps {
  score: number;
  dimensions: HealthScore['dimensions'];
  pills?: string[];
}

interface DimensionBarProps {
  label: string;
  value: number | boolean;
}

function getBarColor(value: number | boolean): string {
  if (typeof value === 'boolean') return value ? '#16A34A' : '#DC2626';
  if (value >= 70) return '#16A34A';
  if (value >= 40) return '#D97706';
  return '#DC2626';
}

function DimensionBar({ label, value }: DimensionBarProps) {
  const numValue = typeof value === 'boolean' ? (value ? 100 : 0) : value;
  const color = getBarColor(value);
  const displayValue = typeof value === 'boolean' ? (value ? '✓' : '✗') : `${numValue}%`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-[#4B5563]">{label}</span>
        <span className="text-[11px] w-8 text-right font-medium" style={{ color }}>{displayValue}</span>
      </div>
      <div className="relative h-1.5 rounded-full w-full" style={{ backgroundColor: '#F0EDE8' }}>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.min(numValue, 100)}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

function ZapIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export default function HealthCard({ score, dimensions, pills = [] }: HealthCardProps) {
  const scoreColor = score >= 70 ? '#16A34A' : score >= 40 ? '#D97706' : '#DC2626';
  const borderColor = score >= 70 ? '#16A34A' : score >= 40 ? '#D97706' : '#DC2626';

  const dimensionEntries: Array<{ label: string; value: number | boolean }> = [
    { label: 'Expiry Risk', value: dimensions.expiryRisk },
    { label: 'Failure Rate', value: dimensions.failureRate },
    { label: 'Recovery Rate', value: dimensions.recoveryRate },
    { label: 'Customer Risk', value: dimensions.customerRisk },
    { label: 'Dunning Config', value: dimensions.dunningConfig },
  ];

  return (
    <div
      className="bg-white overflow-hidden"
      style={{
        maxWidth: '600px',
        borderRadius: '12px',
        border: '1px solid #F0EDE8',
      }}
    >
      {/* Top row */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4">
        <div className="flex items-center gap-1.5">
          <ZapIcon />
          <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
        </div>
        <span className="text-sm text-[#4B5563]">Revenue Safety Score™</span>
      </div>

      {/* Score + dimensions */}
      <div className="flex items-start gap-6 px-6 pb-5">
        {/* Score circle */}
        <div className="flex-shrink-0 flex items-center justify-center" style={{
          width: '120px',
          height: '120px',
          borderRadius: '9999px',
          border: `3px solid ${borderColor}`,
        }}>
          <span
            className="font-bold leading-none"
            style={{ fontSize: '48px', color: scoreColor }}
          >
            {score}
          </span>
        </div>

        {/* Dimension bars */}
        <div className="flex flex-col gap-3 flex-1">
          {dimensionEntries.map((dim) => (
            <DimensionBar key={dim.label} label={dim.label} value={dim.value} />
          ))}
        </div>
      </div>

      {/* Bottom row */}
      <div
        className="flex items-center justify-between px-6 py-3"
        style={{ borderTop: '1px solid #F0EDE8' }}
      >
        <div className="flex items-center gap-2 flex-wrap">
          {pills.map((pill) => (
            <span
              key={pill}
              className="text-[11px] text-[#4B5563] px-2 py-0.5 rounded"
              style={{ backgroundColor: '#F7F5F2' }}
            >
              {pill}
            </span>
          ))}
        </div>
        <span className="text-[11px] text-[#9CA3AF]">revenant.so</span>
      </div>
    </div>
  );
}

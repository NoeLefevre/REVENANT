interface MetricCardProps {
  label: string;
  value: string;
  delta: string;
  color: 'green' | 'purple' | 'gray';
  icon: 'shield' | 'trending-up' | 'mail';
}

const colorMap = {
  green: {
    value: 'text-[#16A34A]',
    delta: 'text-[#16A34A]',
    icon: '#16A34A',
  },
  purple: {
    value: 'text-[#6C63FF]',
    delta: 'text-[#6C63FF]',
    icon: '#6C63FF',
  },
  gray: {
    value: 'text-[#1A1A1A]',
    delta: 'text-[#4B5563]',
    icon: '#9CA3AF',
  },
};

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <polyline points="9 12 11 14 15 10" />
    </svg>
  );
}

function TrendingUpIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function MailIcon({ color }: { color: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <polyline points="2,4 12,13 22,4" />
    </svg>
  );
}

function Icon({ name, color }: { name: MetricCardProps['icon']; color: string }) {
  if (name === 'shield') return <ShieldIcon color={color} />;
  if (name === 'trending-up') return <TrendingUpIcon color={color} />;
  return <MailIcon color={color} />;
}

export default function MetricCard({ label, value, delta, color, icon }: MetricCardProps) {
  const colors = colorMap[color];

  return (
    <div
      className="bg-white rounded-lg p-6 flex flex-col gap-3"
      style={{
        boxShadow: '0 1px 3px #00000010',
        border: '1px solid #F0EDE8',
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#4B5563] leading-tight">{label}</span>
        <Icon name={icon} color={colors.icon} />
      </div>
      <div className={`text-[28px] font-bold leading-none ${colors.value}`}>{value}</div>
      <div className={`text-[13px] ${colors.delta}`}>{delta}</div>
    </div>
  );
}

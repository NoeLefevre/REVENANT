import type { ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: string;
  delta: string;
  borderColor: string;
  icon: ReactNode;
}

export default function MetricCard({ label, value, delta, borderColor, icon }: MetricCardProps) {
  return (
    <div
      className="bg-white rounded-xl p-5 flex flex-col gap-3"
      style={{
        boxShadow: '0 1px 3px #00000010',
        border: '1px solid #F0EDE8',
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-medium text-[#4B5563] leading-tight">{label}</span>
        <div style={{ color: borderColor, opacity: 0.8 }}>{icon}</div>
      </div>
      <div
        className="text-[28px] font-bold leading-none"
        style={{ color: borderColor }}
      >
        {value}
      </div>
      <div className="text-[13px] text-[#4B5563]">{delta}</div>
    </div>
  );
}

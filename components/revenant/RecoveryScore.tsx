import { RecoveryTier } from '@/types/revenant';

interface RecoveryScoreProps {
  score: number;
  showLabel?: boolean;
  className?: string;
}

function getTier(score: number): RecoveryTier {
  if (score >= 70) return 'HIGH_VALUE';
  if (score >= 40) return 'STANDARD';
  return 'LOW_PRIORITY';
}

const tierConfig: Record<RecoveryTier, { bg: string; text: string; label: string }> = {
  HIGH_VALUE: {
    bg: 'bg-[#DCFCE7]',
    text: 'text-[#15803D]',
    label: 'High',
  },
  STANDARD: {
    bg: 'bg-[#FED7AA]',
    text: 'text-[#C2410C]',
    label: 'Standard',
  },
  LOW_PRIORITY: {
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#991B1B]',
    label: 'Low',
  },
};

export default function RecoveryScore({ score, showLabel = false, className = '' }: RecoveryScoreProps) {
  const tier = getTier(score);
  const { bg, text, label } = tierConfig[tier];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ${bg} ${text}`}>
        <strong>{score}</strong>
        <span className="font-normal opacity-70">&nbsp;/100</span>
      </span>
      {showLabel && (
        <span className={`text-[10px] font-medium uppercase tracking-wide ${text}`}>{label}</span>
      )}
    </span>
  );
}

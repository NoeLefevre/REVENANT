import { DIECategory } from '@/types/revenant';

interface DIEBadgeProps {
  category: DIECategory;
  className?: string;
}

const config: Record<DIECategory, { bg: string; text: string; label: string }> = {
  SOFT_TEMPORARY: {
    bg: 'bg-[#FEF9C3]',
    text: 'text-[#854D0E]',
    label: 'Temporary',
  },
  SOFT_UPDATABLE: {
    bg: 'bg-[#FED7AA]',
    text: 'text-[#C2410C]',
    label: 'Card update',
  },
  HARD_PERMANENT: {
    bg: 'bg-[#FEE2E2]',
    text: 'text-[#991B1B]',
    label: 'Permanent',
  },
};

export default function DIEBadge({ category, className = '' }: DIEBadgeProps) {
  const { bg, text, label } = config[category];

  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium ${bg} ${text} ${className}`}
    >
      {label}
    </span>
  );
}

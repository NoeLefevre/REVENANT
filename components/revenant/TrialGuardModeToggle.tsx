'use client';

import { useState } from 'react';

interface Props {
  initialMode: 'universal' | 'selective';
}

export default function TrialGuardModeToggle({ initialMode }: Props) {
  const [mode, setMode] = useState<'universal' | 'selective'>(initialMode);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleChange(newMode: 'universal' | 'selective') {
    if (newMode === mode) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await fetch('/api/settings/trial-guard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trialGuardMode: newMode }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to save');
      }
      setMode(newMode);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toggle */}
      <div className="flex flex-col gap-3">
        {([
          {
            value: 'universal' as const,
            label: 'Universal',
            description: 'Every trial signup is verified. Maximum protection.',
            badge: 'Default',
            badgeBg: '#EDE9FE',
            badgeColor: '#6C63FF',
          },
          {
            value: 'selective' as const,
            label: 'Selective',
            description: 'Only risky signups are verified. Less friction for good customers.',
            badge: null,
            badgeBg: '',
            badgeColor: '',
          },
        ] as const).map((option) => {
          const isActive = mode === option.value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={saving}
              onClick={() => handleChange(option.value)}
              className="flex items-start gap-3 p-4 rounded-lg text-left transition-all cursor-pointer disabled:opacity-50"
              style={{
                border: isActive ? '2px solid #6C63FF' : '2px solid #F0EDE8',
                backgroundColor: isActive ? '#FAFAFE' : '#FAFAFA',
              }}
            >
              {/* Radio circle */}
              <div
                className="flex-shrink-0 w-4 h-4 rounded-full border-2 mt-0.5 flex items-center justify-center"
                style={{
                  borderColor: isActive ? '#6C63FF' : '#D1D5DB',
                  backgroundColor: isActive ? '#6C63FF' : 'transparent',
                }}
              >
                {isActive && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold text-[#1A1A1A]">{option.label}</span>
                  {option.badge && (
                    <span
                      className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full"
                      style={{ backgroundColor: option.badgeBg, color: option.badgeColor }}
                    >
                      {option.badge}
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-[#6B7280] mt-0.5">{option.description}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Status */}
      <div className="h-5 flex items-center">
        {saving && (
          <span className="text-[12px] text-[#9CA3AF]">Saving…</span>
        )}
        {saved && !saving && (
          <span className="text-[12px] text-[#15803D]">Saved</span>
        )}
        {error && !saving && (
          <span className="text-[12px] text-[#DC2626]">{error}</span>
        )}
      </div>
    </div>
  );
}

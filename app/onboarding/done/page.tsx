'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

const MRR_BANDS = [
  { value: 'under_30k', label: 'Under $30K MRR', price: '$49/mo' },
  { value: '30k_80k',   label: '$30K – $80K MRR', price: '$99/mo' },
  { value: 'over_80k',  label: 'Over $80K MRR', price: '$249/mo' },
] as const;

type MrrBand = typeof MRR_BANDS[number]['value'];

export default function OnboardingDonePage() {
  const router = useRouter();
  const [selected, setSelected] = useState<MrrBand | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    if (!selected) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/onboarding/mrr-band', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrrBand: selected }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save MRR band');
      }

      router.push('/overview');
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ backgroundColor: '#FAF8F5' }}
    >
      <div
        className="bg-white w-full flex flex-col gap-8 rounded-xl p-8"
        style={{
          maxWidth: '480px',
          boxShadow: '0 4px 24px #0000000D',
          border: '1px solid #F0EDE8',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ZapIcon />
            <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
          </div>
          <span className="text-[12px] text-[#9CA3AF] font-medium">Step 3 of 3</span>
        </div>

        {/* Success state */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#DCFCE7' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">Your Stripe is connected</h1>
          <p className="text-sm text-[#4B5563] max-w-xs">
            REVENANT has scanned your account. Choose your MRR band to activate protection.
          </p>
        </div>

        {/* MRR band selector */}
        <div className="flex flex-col gap-2">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            Select your MRR band
          </span>
          {MRR_BANDS.map((band) => {
            const isSelected = selected === band.value;
            return (
              <button
                key={band.value}
                onClick={() => setSelected(band.value)}
                className="flex items-center justify-between px-4 py-3 rounded-lg border text-left transition-all"
                style={{
                  borderColor: isSelected ? '#6C63FF' : '#E5E7EB',
                  backgroundColor: isSelected ? '#EDE9FE' : 'white',
                }}
              >
                <span
                  className="text-[14px] font-medium"
                  style={{ color: isSelected ? '#6C63FF' : '#1A1A1A' }}
                >
                  {band.label}
                </span>
                <span
                  className="text-[13px] font-semibold"
                  style={{ color: isSelected ? '#6C63FF' : '#9CA3AF' }}
                >
                  {band.price}
                </span>
              </button>
            );
          })}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-[#DC2626] text-center">{error}</p>
        )}

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleActivate}
            disabled={!selected || loading}
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity"
            style={{
              backgroundColor: '#6C63FF',
              opacity: !selected || loading ? 0.5 : 1,
              cursor: !selected || loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Activating…' : 'Activate REVENANT →'}
          </button>
          <button
            onClick={() => router.push('/overview')}
            className="text-sm text-[#9CA3AF] text-center hover:text-[#4B5563] transition-colors"
          >
            Skip for now →
          </button>
        </div>
      </div>
    </div>
  );
}

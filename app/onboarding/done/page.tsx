'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const MRR_BANDS: Record<string, { label: string; price: string }> = {
  under_30k: { label: 'Under $30K MRR', price: '$49/mo' },
  '30k_80k': { label: '$30K–$80K MRR', price: '$99/mo' },
  over_80k:  { label: 'Over $80K MRR',  price: '$249/mo' },
};

const PROTECTIONS = [
  {
    label: 'Expiry Pre-Dunning',
    desc: 'Warns customers 90 days before their card expires',
  },
  {
    label: 'Smart Dunning — Temporary Failures',
    desc: '5-email sequence over 21 days for NSF/bank-hold failures',
  },
  {
    label: 'Smart Dunning — Card Update Failures',
    desc: '4-email sequence over 14 days for expired/cancelled cards',
  },
  {
    label: 'Smart Retry',
    desc: 'Retries charges on inferred payday, not random intervals',
  },
  {
    label: 'Trial Guard',
    desc: 'Pre-authorizes high-risk trial signups to block bad cards',
  },
  {
    label: 'Chargeback Shield',
    desc: 'Pre-debit notification for high-risk customers before retry',
  },
];

function ActivatePage() {
  const searchParams = useSearchParams();
  const bandKey = searchParams.get('band') ?? 'under_30k';
  const band = MRR_BANDS[bandKey] ?? MRR_BANDS['under_30k'];

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleActivate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/onboarding/mrr-band', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mrrBand: bandKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to activate');
      window.location.href = data.checkoutUrl;
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
        className="bg-white w-full flex flex-col gap-6 rounded-xl p-8"
        style={{ maxWidth: '520px', boxShadow: '0 4px 24px #0000000D', border: '1px solid #F0EDE8' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <ZapIcon />
            <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
          </div>
          <span className="text-[12px] text-[#9CA3AF] font-medium">Step 3 of 3</span>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1 text-center">
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">One click. Everything protected.</h1>
          <p className="text-sm text-[#4B5563]">
            REVENANT activates all protections with sensible defaults. Customize anytime from settings.
          </p>
        </div>

        {/* Protection list */}
        <div className="flex flex-col gap-2">
          {PROTECTIONS.map((p) => (
            <div
              key={p.label}
              className="flex items-start gap-3 p-3 rounded-lg"
              style={{ backgroundColor: '#F7F5F2', border: '1px solid #F0EDE8' }}
            >
              <div
                className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center mt-0.5"
                style={{ backgroundColor: '#6C63FF' }}
              >
                <CheckIcon />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-[13px] font-semibold text-[#1A1A1A]">{p.label}</span>
                <span className="text-[11px] text-[#6B7280]">{p.desc}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Pricing */}
        <div
          className="flex flex-col items-center gap-1 p-4 rounded-lg"
          style={{ backgroundColor: '#EDE9FE', border: '1px solid #C4B5FD' }}
        >
          <span className="text-[24px] font-bold text-[#6C63FF]">{band.price}</span>
          <span className="text-[12px] text-[#6D28D9]">
            {band.label} · Cancel anytime · No contract
          </span>
        </div>

        {error && (
          <p className="text-sm text-[#DC2626] text-center">{error}</p>
        )}

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleActivate}
            disabled={loading}
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold transition-opacity"
            style={{
              backgroundColor: '#6C63FF',
              opacity: loading ? 0.6 : 1,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Redirecting to payment…' : 'Activate REVENANT →'}
          </button>
          <p className="text-[11px] text-[#9CA3AF] text-center">
            30-day money-back guarantee
          </p>
        </div>
      </div>
    </div>
  );
}

// useSearchParams() requires Suspense boundary
export default function OnboardingDonePage() {
  return (
    <Suspense>
      <ActivatePage />
    </Suspense>
  );
}

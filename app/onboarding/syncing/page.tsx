'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

const STEPS = [
  'Connecting to your Stripe account…',
  'Fetching active subscriptions…',
  'Scanning failed invoices (last 90 days)…',
  'Analyzing payment methods…',
  'Computing Recovery Scores…',
  'Almost done…',
];

export default function SyncingPage() {
  const router = useRouter();
  const { status } = useSession();
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Guard: redirect unauthenticated visitors to signin
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/api/auth/signin?callbackUrl=/onboarding');
    }
  }, [status, router]);

  useEffect(() => {
    // Don't start polling until we know the user is authenticated
    if (status !== 'authenticated') return;

    const POLL_INTERVAL_MS = 3000;
    const MAX_POLL_MS = 90000; // 90s hard timeout — sync should never take longer
    const startedAt = Date.now();

    // Cycle through step labels every 2.5s for UX feedback
    const labelInterval = setInterval(() => {
      setStepIndex((i) => Math.min(i + 1, STEPS.length - 1));
    }, 2500);

    // Poll sync status every 3s
    const pollInterval = setInterval(async () => {
      // Hard timeout — stop polling and surface an error after 90s
      if (Date.now() - startedAt > MAX_POLL_MS) {
        clearInterval(labelInterval);
        clearInterval(pollInterval);
        setError('Sync is taking too long. Please try again or contact support.');
        return;
      }

      try {
        const res = await fetch('/api/stripe-connect/status');

        if (!res.ok) {
          console.warn('[syncing] /api/stripe-connect/status returned', res.status);
          return;
        }

        const data = await res.json();
        console.log('[syncing] poll →', data.syncStatus, data.syncError ?? '');

        if (data.syncStatus === 'done') {
          clearInterval(labelInterval);
          clearInterval(pollInterval);
          router.push('/onboarding/score');
        } else if (data.syncStatus === 'error') {
          clearInterval(labelInterval);
          clearInterval(pollInterval);
          setError(data.syncError || 'Sync failed. Please try again.');
        }
        // 'pending' or 'syncing' → keep polling
      } catch {
        // Network error — keep polling
        console.warn('[syncing] poll fetch failed, retrying...');
      }
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(labelInterval);
      clearInterval(pollInterval);
    };
  }, [status, router]);

  // Show nothing while session is loading or redirecting
  if (status === 'loading' || status === 'unauthenticated') {
    return null;
  }

  if (error) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
        style={{ backgroundColor: '#FAF8F5' }}
      >
        <div
          className="bg-white w-full flex flex-col gap-6 rounded-xl p-8 text-center"
          style={{ maxWidth: '480px', boxShadow: '0 4px 24px #0000000D', border: '1px solid #FECACA' }}
        >
          <div className="flex items-center justify-center gap-1.5">
            <ZapIcon />
            <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
          </div>
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#FEE2E2' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <div className="flex flex-col gap-1">
            <h2 className="text-[18px] font-bold text-[#1A1A1A]">Sync failed</h2>
            <p className="text-sm text-[#DC2626]">{error}</p>
          </div>
          <a
            href="/onboarding"
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Try again →
          </a>
        </div>
      </div>
    );
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
          <span className="text-[12px] text-[#9CA3AF] font-medium">Step 2 of 3</span>
        </div>

        {/* Spinner + title */}
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className="w-14 h-14 rounded-full border-4 animate-spin"
            style={{
              borderColor: '#EDE9FE',
              borderTopColor: '#6C63FF',
            }}
          />
          <h1 className="text-[20px] font-bold text-[#1A1A1A]">Syncing your Stripe data</h1>
          <p className="text-sm text-[#4B5563] min-h-[20px] transition-all">
            {STEPS[stepIndex]}
          </p>
        </div>

        {/* Progress steps */}
        <div className="flex flex-col gap-3">
          {STEPS.slice(0, 4).map((step, i) => {
            const isDone = i < stepIndex;
            const isCurrent = i === stepIndex;
            return (
              <div key={step} className="flex items-center gap-3">
                <div
                  className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                  style={{
                    backgroundColor: isDone ? '#DCFCE7' : isCurrent ? '#EDE9FE' : '#F3F4F6',
                  }}
                >
                  {isDone ? (
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : isCurrent ? (
                    <div
                      className="w-2 h-2 rounded-full animate-pulse"
                      style={{ backgroundColor: '#6C63FF' }}
                    />
                  ) : (
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#D1D5DB' }} />
                  )}
                </div>
                <span
                  className="text-[13px]"
                  style={{
                    color: isDone ? '#16A34A' : isCurrent ? '#6C63FF' : '#9CA3AF',
                    fontWeight: isCurrent ? 500 : 400,
                  }}
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>

        <p className="text-[11px] text-[#9CA3AF] text-center">
          This usually takes less than 30 seconds
        </p>
      </div>
    </div>
  );
}

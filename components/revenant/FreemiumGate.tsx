'use client';

import Link from 'next/link';

interface FreemiumGateProps {
  hasAccess: boolean;
  children: React.ReactNode;
}

/**
 * Wraps dashboard content with a blur + paywall overlay when the user has no active subscription.
 * Usage: wrap <main> content in the dashboard layout.
 */
export default function FreemiumGate({ hasAccess, children }: FreemiumGateProps) {
  if (hasAccess) return <>{children}</>;

  return (
    <div className="relative flex-1 h-full">
      {/* Blurred content */}
      <div className="pointer-events-none select-none" style={{ filter: 'blur(4px)', opacity: 0.45 }}>
        {children}
      </div>

      {/* Overlay */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: 'rgba(250, 248, 245, 0.6)', backdropFilter: 'blur(2px)' }}
      >
        <div
          className="bg-white flex flex-col items-center gap-5 rounded-xl p-8 text-center mx-4"
          style={{
            maxWidth: '400px',
            width: '100%',
            boxShadow: '0 8px 40px #0000001A',
            border: '1px solid #F0EDE8',
          }}
        >
          {/* Icon */}
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#EDE9FE' }}
          >
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#6C63FF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>

          <div className="flex flex-col gap-2">
            <h2 className="text-[18px] font-bold text-[#1A1A1A]">Activate REVENANT</h2>
            <p className="text-sm text-[#4B5563]">
              Subscribe to unlock intelligent dunning, card expiry alerts, and real-time recovery for your MRR.
            </p>
          </div>

          <div className="flex flex-col gap-3 w-full">
            <Link
              href="/onboarding/done"
              className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#6C63FF' }}
            >
              Choose a plan →
            </Link>
            <Link
              href="/audit"
              className="text-sm text-[#9CA3AF] text-center hover:text-[#4B5563] transition-colors"
            >
              See your revenue health audit
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

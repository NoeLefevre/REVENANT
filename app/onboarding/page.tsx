import { redirect } from 'next/navigation';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import StripeConnectionModel from '@/models/StripeConnection';

function ZapIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#6C63FF" stroke="#6C63FF" strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

export default async function OnboardingPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin?callbackUrl=/onboarding');
  }

  // If already connected, skip to syncing or overview
  try {
    await connectMongo();
    const connection = await (StripeConnectionModel as any)
      .findOne({ userId: session.user.id })
      .lean();

    if (connection) {
      const status = (connection as any).syncStatus;
      if (status === 'done') {
        redirect('/overview');
      } else {
        redirect('/onboarding/syncing');
      }
    }
  } catch (err) {
    console.error('[OnboardingPage] Error:', err);
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
          <span className="text-[12px] text-[#9CA3AF] font-medium">Step 1 of 3</span>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-3 text-center">
          <div
            className="mx-auto w-14 h-14 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#EDE9FE' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
          </div>
          <h1 className="text-[22px] font-bold text-[#1A1A1A]">Connect your Stripe account</h1>
          <p className="text-sm text-[#4B5563] max-w-xs mx-auto">
            REVENANT needs read-write access to your Stripe account to detect failed payments and protect your MRR.
          </p>
        </div>

        {/* What we access */}
        <div
          className="flex flex-col gap-2 p-4 rounded-lg"
          style={{ backgroundColor: '#F7F5F2', border: '1px solid #F0EDE8' }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9CA3AF]">
            What REVENANT accesses
          </span>
          {[
            'Active subscriptions & payment methods',
            'Failed invoices from the last 90 days',
            'Card expiry dates for prevention',
          ].map((item) => (
            <div key={item} className="flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span className="text-[13px] text-[#4B5563]">{item}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex flex-col gap-3">
          <a
            href="/api/stripe-connect/authorize"
            className="w-full py-3 rounded-lg text-white text-[15px] font-semibold text-center transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Connect Stripe →
          </a>
          <p className="text-[11px] text-[#9CA3AF] text-center">
            OAuth secured · Read-write access · Revoke anytime
          </p>
        </div>
      </div>
    </div>
  );
}

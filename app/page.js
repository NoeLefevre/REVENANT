import { redirect } from 'next/navigation';
import Link from 'next/link';
import DashboardPreview from '@/components/revenant/DashboardPreview';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import UserModel from '@/models/User';

export const metadata = {
  title: 'REVENANT — Stop Losing MRR to Failed Payments',
  description:
    'REVENANT automatically recovers failed invoices, prevents card expiry surprises, and shields your SaaS from chargebacks — before they hurt your MRR.',
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function ZapIcon({ size = 16, color = '#6C63FF' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth="1">
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-[#F0EDE8]">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5">
          <ZapIcon />
          <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6">
          <a href="#how-it-works" className="text-sm text-[#4B5563] hover:text-[#1A1A1A] transition-colors">
            How it works
          </a>
          <a href="#pricing" className="text-sm text-[#4B5563] hover:text-[#1A1A1A] transition-colors">
            Pricing
          </a>
          <a href="#faq" className="text-sm text-[#4B5563] hover:text-[#1A1A1A] transition-colors">
            FAQ
          </a>
        </nav>
        <div className="flex items-center gap-3">
          <Link
            href="/signin"
            className="text-sm text-[#4B5563] hover:text-[#1A1A1A] transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/audit"
            className="px-4 py-2 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6C63FF' }}
          >
            Get free audit
          </Link>
        </div>
      </div>
    </header>
  );
}

// ── Hero ──────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section style={{ backgroundColor: '#FAF8F5', overflow: 'hidden' }}>
      {/* Text block */}
      <div className="pt-20 pb-10 px-6">
        <div className="max-w-3xl mx-auto flex flex-col items-center gap-7 text-center">
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-medium"
            style={{ backgroundColor: '#EDE9FE', color: '#6C63FF' }}
          >
            <ZapIcon size={12} />
            Intelligent revenue protection for SaaS
          </div>

          {/* Headline */}
          <h1 className="text-[48px] md:text-[64px] font-bold leading-[1.05] text-[#1A1A1A]">
            Stop losing MRR to{' '}
            <span style={{ color: '#DC2626' }}>failed payments</span>
          </h1>

          {/* Subheadline */}
          <p className="text-[18px] text-[#4B5563] max-w-xl leading-relaxed">
            REVENANT connects to your Stripe in 60 seconds, classifies every decline, and automatically
            recovers failed invoices — before your customers churn.
          </p>

          {/* Primary CTA */}
          <Link
            href="/audit"
            className="px-8 py-4 rounded-lg text-white text-[16px] font-semibold transition-opacity hover:opacity-90"
            style={{ backgroundColor: '#6C63FF', boxShadow: '0 4px 20px rgba(108,99,255,0.35)' }}
          >
            Get my free audit →
          </Link>

          {/* Social proof */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex -space-x-2">
              {['#6C63FF', '#DC2626', '#16A34A', '#D97706', '#3B82F6'].map((color, i) => (
                <div
                  key={i}
                  className="w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-white text-[11px] font-bold"
                  style={{ backgroundColor: color }}
                >
                  {String.fromCharCode(65 + i)}
                </div>
              ))}
            </div>
            <p className="text-[13px] text-[#9CA3AF]">
              Trusted by <strong className="text-[#4B5563]">37 SaaS teams</strong> protecting over{' '}
              <strong className="text-[#4B5563]">$2.1M MRR</strong>
            </p>
          </div>
        </div>
      </div>

      {/* Dashboard preview — flows directly from text, no section break */}
      <DashboardPreview />
    </section>
  );
}

// ── Problem ───────────────────────────────────────────────────────────────────

function Problem() {
  const problems = [
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#DC2626" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="9" y1="15" x2="15" y2="15" />
        </svg>
      ),
      bg: '#FEF2F2',
      title: 'Failed payments go unrecovered',
      body: 'card_declined, insufficient_funds, do_not_honor — Stripe retries once and gives up. You lose the revenue silently while the subscription stays active.',
      stat: '3–5%',
      statLabel: 'of MRR lost monthly on average',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
          <line x1="1" y1="10" x2="23" y2="10" />
        </svg>
      ),
      bg: '#FEF9C3',
      title: 'Card expiry kills subscriptions',
      body: 'Customers forget to update their payment method. No alert, no warning — the next charge fails and they churn. Prevention costs nothing, the failure costs everything.',
      stat: '1 in 4',
      statLabel: 'churns are caused by expired cards',
    },
    {
      icon: (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#6C63FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      ),
      bg: '#EDE9FE',
      title: 'Chargebacks destroy your Stripe rating',
      body: 'High-risk customers disputing charges put your Stripe account at risk. A pre-debit email before billing reduces disputes by 40%+ — and takes 10 minutes to set up.',
      stat: '$15–$100',
      statLabel: 'cost per chargeback dispute',
    },
  ];

  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">The problem</p>
          <h2 className="text-[36px] font-bold text-[#1A1A1A]">
            Your MRR is leaking in 3 places
          </h2>
          <p className="text-[16px] text-[#4B5563] max-w-xl mx-auto">
            Stripe is a billing tool, not a recovery tool. It doesn&apos;t know your customers,
            their pay cycles, or when to stop retrying.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {problems.map((p) => (
            <div
              key={p.title}
              className="flex flex-col gap-4 p-6 rounded-xl"
              style={{ border: '1px solid #F0EDE8', boxShadow: '0 1px 3px #00000008' }}
            >
              <div
                className="w-11 h-11 rounded-lg flex items-center justify-center"
                style={{ backgroundColor: p.bg }}
              >
                {p.icon}
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-[15px] font-semibold text-[#1A1A1A]">{p.title}</h3>
                <p className="text-[13px] text-[#4B5563] leading-relaxed">{p.body}</p>
              </div>
              <div className="mt-auto pt-4 border-t border-[#F0EDE8]">
                <span className="text-[24px] font-bold text-[#1A1A1A]">{p.stat}</span>
                <p className="text-[12px] text-[#9CA3AF]">{p.statLabel}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Product Layers ────────────────────────────────────────────────────────────

function ProductLayers() {
  const layers = [
    {
      number: '01',
      name: 'DIE Engine™',
      tagline: 'Decline Intelligence Engine',
      description:
        'Every failed payment is classified into one of three categories: SOFT_TEMPORARY (retry on payday), SOFT_UPDATABLE (ask customer to update card), or HARD_PERMANENT (stop trying). No wasted retries. No annoyed customers.',
      color: '#DC2626',
      bg: '#FEF2F2',
      features: ['card_declined → SOFT_TEMPORARY', 'card_expired → SOFT_UPDATABLE', 'do_not_honor → HARD_PERMANENT'],
    },
    {
      number: '02',
      name: 'Smart Dunning',
      tagline: 'Payday-aware retry sequences',
      description:
        'REVENANT infers your customer\'s pay cycle from their charge history and schedules retries right after their next payday. 5-email sequences for temporary failures, 4-email card update campaigns for expired cards.',
      color: '#6C63FF',
      bg: '#EDE9FE',
      features: ['Inferred payday retry scheduling', 'Country-aware benchmarks (US/UK/FR/DE)', 'Idempotent sequence management'],
    },
    {
      number: '03',
      name: 'Card Shield',
      tagline: 'Prevention before the failure',
      description:
        'REVENANT monitors every card in your Stripe account and sends expiry alerts at J-30, J-14, and J-7. For high-risk customers, a pre-debit email 7 days before billing dramatically reduces chargebacks.',
      color: '#16A34A',
      bg: '#DCFCE7',
      features: ['J-30 / J-14 / J-7 expiry alerts', 'Chargeback Shield pre-debit emails', 'Recovery Score™ per customer (0–100)'],
    },
  ];

  return (
    <section className="py-20 px-6" style={{ backgroundColor: '#FAF8F5' }}>
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">Product</p>
          <h2 className="text-[36px] font-bold text-[#1A1A1A]">Three layers of protection</h2>
          <p className="text-[16px] text-[#4B5563] max-w-xl mx-auto">
            Each layer works independently and compounds the others.
          </p>
        </div>

        <div className="flex flex-col gap-6">
          {layers.map((layer) => (
            <div
              key={layer.number}
              className="bg-white rounded-xl p-8 flex flex-col md:flex-row gap-8"
              style={{ border: '1px solid #F0EDE8', boxShadow: '0 1px 3px #00000008' }}
            >
              {/* Left */}
              <div className="flex flex-col gap-4 flex-1">
                <div className="flex items-center gap-3">
                  <span
                    className="text-[11px] font-bold tracking-[1px]"
                    style={{ color: layer.color }}
                  >
                    {layer.number}
                  </span>
                  <div
                    className="h-px flex-1"
                    style={{ backgroundColor: layer.color, opacity: 0.2 }}
                  />
                </div>
                <div>
                  <h3 className="text-[22px] font-bold text-[#1A1A1A]">{layer.name}</h3>
                  <p className="text-[13px] font-medium mt-0.5" style={{ color: layer.color }}>
                    {layer.tagline}
                  </p>
                </div>
                <p className="text-[14px] text-[#4B5563] leading-relaxed">{layer.description}</p>
              </div>

              {/* Right */}
              <div
                className="flex flex-col gap-3 p-5 rounded-lg md:w-72 flex-shrink-0"
                style={{ backgroundColor: layer.bg }}
              >
                {layer.features.map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <div
                      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: 'white' }}
                    >
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={layer.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <span className="text-[13px] font-mono text-[#1A1A1A]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── How It Works ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      n: '1',
      title: 'Connect Stripe in 60s',
      body: 'One-click OAuth. REVENANT gets read access to subscriptions, invoices, and payment methods. We never touch your payouts or customer data outside of recovery.',
    },
    {
      n: '2',
      title: 'Instant revenue scan',
      body: 'REVENANT scans the last 90 days of failed invoices, classifies every decline with the DIE Engine, and computes a Recovery Score for each customer.',
    },
    {
      n: '3',
      title: 'Recovery starts automatically',
      body: 'Dunning sequences start immediately. Card expiry alerts go out on schedule. Chargeback Shield emails are sent before each risky billing cycle. You just watch the recoveries come in.',
    },
  ];

  return (
    <section id="how-it-works" className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">Setup</p>
          <h2 className="text-[36px] font-bold text-[#1A1A1A]">Up and running in 5 minutes</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step) => (
            <div key={step.n} className="flex flex-col gap-4">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[15px] font-bold"
                style={{ backgroundColor: '#6C63FF' }}
              >
                {step.n}
              </div>
              <h3 className="text-[16px] font-semibold text-[#1A1A1A]">{step.title}</h3>
              <p className="text-[14px] text-[#4B5563] leading-relaxed">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── Pricing ───────────────────────────────────────────────────────────────────

function Pricing() {
  const plans = [
    {
      name: 'Starter',
      mrr: 'Under $30K MRR',
      price: '$49',
      period: '/mo',
      cta: 'Start protecting →',
      featured: false,
      features: [
        'Automated dunning sequences',
        'DIE Decline classification',
        'Card expiry alerts (J-30/14/7)',
        'Recovery Score per customer',
        'Up to $30K MRR protected',
      ],
    },
    {
      name: 'Growth',
      mrr: '$30K – $80K MRR',
      price: '$99',
      period: '/mo',
      cta: 'Start protecting →',
      featured: true,
      features: [
        'Everything in Starter',
        'Chargeback Shield pre-debit emails',
        'Payday-aware retry scheduling',
        'Revenue Safety Score™ card',
        'Up to $80K MRR protected',
      ],
    },
    {
      name: 'Scale',
      mrr: 'Over $80K MRR',
      price: '$249',
      period: '/mo',
      cta: 'Contact us →',
      featured: false,
      features: [
        'Everything in Growth',
        'Priority support',
        'Custom dunning sequence timing',
        'Slack recovery alerts',
        'Unlimited MRR protected',
      ],
    },
  ];

  return (
    <section id="pricing" className="py-20 px-6" style={{ backgroundColor: '#FAF8F5' }}>
      <div className="max-w-5xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">Pricing</p>
          <h2 className="text-[36px] font-bold text-[#1A1A1A]">Simple pricing, based on your MRR</h2>
          <p className="text-[16px] text-[#4B5563]">
            Cancel anytime. No setup fees. No per-recovery commissions.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className="bg-white rounded-xl p-6 flex flex-col gap-5"
              style={{
                border: plan.featured ? '2px solid #6C63FF' : '1px solid #F0EDE8',
                boxShadow: plan.featured ? '0 4px 24px #6C63FF1A' : '0 1px 3px #00000008',
                position: 'relative',
              }}
            >
              {plan.featured && (
                <div
                  className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-[11px] font-semibold text-white"
                  style={{ backgroundColor: '#6C63FF' }}
                >
                  Most popular
                </div>
              )}

              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold text-[#4B5563]">{plan.mrr}</span>
                <h3 className="text-[18px] font-bold text-[#1A1A1A]">{plan.name}</h3>
              </div>

              <div className="flex items-end gap-1">
                <span className="text-[40px] font-bold text-[#1A1A1A] leading-none">{plan.price}</span>
                <span className="text-[14px] text-[#9CA3AF] mb-1">{plan.period}</span>
              </div>

              <Link
                href="/audit"
                className="w-full py-2.5 rounded-lg text-[14px] font-semibold text-center transition-opacity hover:opacity-90"
                style={{
                  backgroundColor: plan.featured ? '#6C63FF' : 'white',
                  color: plan.featured ? 'white' : '#6C63FF',
                  border: plan.featured ? 'none' : '1.5px solid #6C63FF',
                }}
              >
                {plan.cta}
              </Link>

              <div className="flex flex-col gap-2.5 pt-2 border-t border-[#F0EDE8]">
                {plan.features.map((f) => (
                  <div key={f} className="flex items-center gap-2.5">
                    <CheckIcon />
                    <span className="text-[13px] text-[#4B5563]">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── FAQ ───────────────────────────────────────────────────────────────────────

function FAQ() {
  const faqs = [
    {
      q: 'What Stripe access does REVENANT need?',
      a: 'REVENANT uses Stripe Connect OAuth — read access only to subscriptions, invoices, and payment methods. We never have access to your payouts, balance, or the ability to modify your account. You can revoke access at any time.',
    },
    {
      q: 'Does REVENANT charge my customers directly?',
      a: 'No. REVENANT retries existing Stripe invoices through your own connected account. The payment attempt appears as normal in your Stripe dashboard. We act on your behalf — never independently.',
    },
    {
      q: 'Is my Stripe data secure?',
      a: 'All Stripe access tokens are encrypted at rest with AES-256-GCM. We don\'t store card numbers or PAN data. Your customer\'s Stripe data is only used for recovery actions you configure.',
    },
    {
      q: 'What happens when a card is declined as HARD_PERMANENT?',
      a: 'REVENANT stops retrying immediately (codes like do_not_honor, card_velocity_exceeded). This protects your Stripe account health and avoids frustrating customers with unrecoverable failures.',
    },
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. Cancel anytime from your settings page. Active dunning sequences will stop immediately. No cancellation fees, no lock-in.',
    },
    {
      q: 'How does payday-aware retrying work?',
      a: 'REVENANT analyzes the timing of previous successful charges for each customer to infer their pay cycle. If that\'s not available, we use country-level payday benchmarks (e.g. US: 1st, UK: 25th, France: 28th). Retries are scheduled for 1–2 days after the inferred payday.',
    },
  ];

  return (
    <section id="faq" className="py-20 px-6 bg-white">
      <div className="max-w-3xl mx-auto flex flex-col gap-12">
        <div className="flex flex-col gap-3 text-center">
          <p className="text-[13px] font-semibold uppercase tracking-[1px] text-[#9CA3AF]">FAQ</p>
          <h2 className="text-[36px] font-bold text-[#1A1A1A]">Frequently asked questions</h2>
        </div>

        <div className="flex flex-col divide-y divide-[#F0EDE8]">
          {faqs.map((faq) => (
            <details key={faq.q} className="group py-5">
              <summary className="flex items-center justify-between gap-4 cursor-pointer list-none">
                <span className="text-[15px] font-medium text-[#1A1A1A]">{faq.q}</span>
                <svg
                  className="flex-shrink-0 transition-transform group-open:rotate-180"
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#9CA3AF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </summary>
              <p className="mt-3 text-[14px] text-[#4B5563] leading-relaxed">{faq.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── CTA ───────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <section className="py-20 px-6" style={{ backgroundColor: '#1A1A1A' }}>
      <div className="max-w-3xl mx-auto flex flex-col items-center gap-6 text-center">
        <ZapIcon size={32} color="#6C63FF" />
        <h2 className="text-[36px] font-bold text-white">
          How much MRR are you losing right now?
        </h2>
        <p className="text-[16px] text-[#9CA3AF] max-w-lg">
          Get your free Revenue Health Audit in 60 seconds. See exactly how much is at risk —
          no credit card required.
        </p>
        <Link
          href="/audit"
          className="px-8 py-4 rounded-lg text-white text-[16px] font-semibold transition-opacity hover:opacity-90"
          style={{ backgroundColor: '#6C63FF' }}
        >
          Get my free audit →
        </Link>
        <p className="text-[12px] text-[#4B5563]">
          5-minute setup · No credit card · Cancel anytime
        </p>
      </div>
    </section>
  );
}

// ── Footer ────────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="py-10 px-6 border-t border-[#F0EDE8] bg-white">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-1.5">
          <ZapIcon />
          <span className="text-sm font-bold text-[#6C63FF]">REVENANT</span>
        </div>
        <div className="flex items-center gap-5">
          <Link href="/privacy-policy" className="text-[13px] text-[#9CA3AF] hover:text-[#4B5563] transition-colors">
            Privacy
          </Link>
          <Link href="/tos" className="text-[13px] text-[#9CA3AF] hover:text-[#4B5563] transition-colors">
            Terms
          </Link>
          <Link href="/blog" className="text-[13px] text-[#9CA3AF] hover:text-[#4B5563] transition-colors">
            Blog
          </Link>
          <a href="mailto:hello@revenant.so" className="text-[13px] text-[#9CA3AF] hover:text-[#4B5563] transition-colors">
            Contact
          </a>
        </div>
        <p className="text-[12px] text-[#9CA3AF]">© {new Date().getFullYear()} REVENANT</p>
      </div>
    </footer>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function Home() {
  const session = await auth();

  if (session?.user?.email) {
    // Determine destination before calling redirect() — redirect() throws internally
    // and must never be inside a try/catch or it gets silently swallowed.
    let destination = '/onboarding';
    try {
      await connectMongo();
      const dbUser = await UserModel.findOne({ email: session.user.email }).lean();
      if (dbUser?.stripeConnectionId) {
        destination = '/overview';
      }
    } catch {
      // DB error → safe default: redirect to /onboarding
    }
    redirect(destination);
  }

  return (
    <>
      <Header />
      <main>
        <Hero />
        <Problem />
        <ProductLayers />
        <HowItWorks />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  );
}

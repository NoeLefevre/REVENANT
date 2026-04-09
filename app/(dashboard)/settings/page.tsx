import { auth } from '@/libs/auth';
import { redirect } from 'next/navigation';
import connectMongo from '@/libs/mongoose';
import StripeConnectionModel from '@/models/StripeConnection';
import DisconnectStripeButton from '@/components/DisconnectStripeButton';
import TrialGuardModeToggle from '@/components/revenant/TrialGuardModeToggle';

interface PageProps {
  searchParams: Promise<{
    section?: string;
  }>;
}

export default async function SettingsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/api/auth/signin');
  }

  const params = await searchParams;
  const section = params.section ?? 'stripe';

  // session.user.id is the User._id (ObjectId as string) — matches userId in StripeConnection
  const userId = session.user.id;

  let stripeConnection: any = null;
  let error: string | null = null;

  try {
    await connectMongo();
    // StripeConnection uses userId (not orgId)
    stripeConnection = await (StripeConnectionModel as any).findOne({ userId }).lean();
  } catch (err) {
    console.error('[SettingsPage] Error:', err);
    error = 'Failed to load settings. Please try again.';
  }

  const navItems = [
    { key: 'stripe', label: 'Stripe' },
    { key: 'trial-guard', label: 'Trial Guard' },
  ];

  return (
    <div className="flex p-6 gap-6">
      {/* Sub-nav */}
      <nav className="flex flex-col gap-1 flex-shrink-0" style={{ width: '200px' }}>
        {navItems.map((item) => {
          const isActive = section === item.key;
          return (
            <a
              key={item.key}
              href={`/settings?section=${item.key}`}
              className="h-10 px-3 rounded-lg flex items-center text-sm font-medium transition-colors"
              style={{
                backgroundColor: isActive ? '#EDE9FE' : 'transparent',
                color: isActive ? '#6C63FF' : '#4B5563',
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>

      {/* Main */}
      <div className="flex flex-col gap-4 flex-1 min-w-0">
        {/* Error */}
        {error && (
          <div className="bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-4 text-[#DC2626] text-sm">
            {error}
          </div>
        )}

        {section === 'stripe' && (
          <>
            {/* Connection card */}
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-4"
              style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Stripe Connection</h2>
                  <p className="text-[12px] text-[#4B5563] mt-0.5">
                    Connect your Stripe account to start recovering revenue.
                  </p>
                </div>
                {stripeConnection ? (
                  <span className="inline-flex items-center rounded px-2.5 py-1 text-[12px] font-medium bg-[#DCFCE7] text-[#15803D]">
                    ● Connected
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded px-2.5 py-1 text-[12px] font-medium bg-[#F3F4F6] text-[#6B7280]">
                    Not connected
                  </span>
                )}
              </div>

              {stripeConnection ? (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: '#F7F5F2' }}>
                    <div className="flex flex-col gap-0.5 flex-1">
                      <span className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                        Account ID
                      </span>
                      <span className="text-[13px] font-mono text-[#1A1A1A]">
                        {stripeConnection.stripeAccountId}
                      </span>
                    </div>
                    {stripeConnection.livemode ? (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#DCFCE7] text-[#15803D]">
                        Live
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded px-2 py-0.5 text-[11px] font-medium bg-[#FEF9C3] text-[#854D0E]">
                        Test
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                      Connected at
                    </span>
                    <span className="text-[13px] text-[#4B5563]">
                      {new Date(stripeConnection.createdAt).toLocaleDateString('en-US', {
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                      Sync status
                    </span>
                    <span className="text-[13px] text-[#4B5563] capitalize">
                      {stripeConnection.syncStatus ?? 'pending'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-sm text-[#4B5563]">
                    Connect your Stripe account to sync invoices, subscriptions, and start automated recovery.
                  </p>
                  {/* Correct URL: /api/stripe-connect/authorize */}
                  <a
                    href="/api/stripe-connect/authorize"
                    className="inline-flex items-center justify-center px-4 py-2.5 rounded-lg text-white text-sm font-medium self-start"
                    style={{ backgroundColor: '#6C63FF' }}
                  >
                    Connect Stripe →
                  </a>
                </div>
              )}
            </div>

            {/* Webhook card */}
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-4"
              style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
            >
              <div>
                <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Stripe Webhook</h2>
                <p className="text-[12px] text-[#4B5563] mt-0.5">
                  Add this webhook URL in your Stripe Connect dashboard to receive real-time events.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-10 px-3 flex items-center rounded-lg border border-[#E5E7EB] font-mono text-[12px] text-[#4B5563] overflow-hidden">
                  {/* Correct webhook path */}
                  <span className="truncate">/api/webhook/stripe-connect</span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[11px] font-medium uppercase tracking-wide text-[#9CA3AF]">
                  Required events
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    'customer.subscription.created',
                    'customer.subscription.updated',
                    'customer.subscription.deleted',
                    'invoice.payment_failed',
                    'invoice.payment_succeeded',
                    'payment_method.updated',
                    'payment_method.attached',
                  ].map((evt) => (
                    <span
                      key={evt}
                      className="font-mono text-[11px] px-2 py-0.5 rounded"
                      style={{ backgroundColor: '#F7F5F2', color: '#4B5563' }}
                    >
                      {evt}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Danger card */}
            <div
              className="bg-white rounded-lg p-6 flex flex-col gap-4"
              style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #FECACA' }}
            >
              <div>
                <h2 className="text-[15px] font-semibold text-[#DC2626]">Danger Zone</h2>
                <p className="text-[12px] text-[#4B5563] mt-0.5">
                  These actions are irreversible. Please proceed with caution.
                </p>
              </div>

              <div
                className="flex items-center justify-between p-4 rounded-lg"
                style={{ backgroundColor: '#FEF2F2' }}
              >
                <div>
                  <span className="text-[13px] font-medium text-[#1A1A1A]">Disconnect Stripe account</span>
                  <p className="text-[12px] text-[#4B5563] mt-0.5">
                    This will stop all recovery sequences and remove your Stripe connection.
                  </p>
                </div>
                <DisconnectStripeButton disabled={!stripeConnection} />
              </div>
            </div>
          </>
        )}

        {section === 'trial-guard' && (
          <div
            className="bg-white rounded-lg p-6 flex flex-col gap-5"
            style={{ boxShadow: '0 1px 3px #00000010', border: '1px solid #F0EDE8' }}
          >
            <div>
              <h2 className="text-[15px] font-semibold text-[#1A1A1A]">Trial Guard</h2>
              <p className="text-[12px] text-[#4B5563] mt-0.5">
                Control how REVENANT verifies trial signups.
              </p>
            </div>
            <TrialGuardModeToggle
              initialMode={stripeConnection?.trialGuardMode ?? 'universal'}
            />
          </div>
        )}
      </div>
    </div>
  );
}

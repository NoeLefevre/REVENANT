import { redirect } from 'next/navigation';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import Sidebar from '@/components/revenant/Sidebar';
import FreemiumGate from '@/components/revenant/FreemiumGate';
import UserModel from '@/models/User';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect('/api/auth/signin');
  }

  let userRecord: { name?: string; email?: string; image?: string; hasAccess?: boolean } | null = null;

  try {
    await connectMongo();
    const dbUser = await (UserModel as any).findOne({ email: session.user.email }).lean();
    if (dbUser) {
      userRecord = {
        name: dbUser.name ?? session.user.name ?? undefined,
        email: dbUser.email ?? session.user.email ?? undefined,
        image: dbUser.image ?? session.user.image ?? undefined,
        hasAccess: dbUser.hasAccess ?? false,
      };
    }
  } catch (err) {
    console.error('[DashboardLayout] MongoDB error:', err);
  }

  const sidebarUser = {
    name: userRecord?.name ?? session.user.name ?? undefined,
    email: userRecord?.email ?? session.user.email ?? undefined,
    image: userRecord?.image ?? session.user.image ?? undefined,
  };

  const hasAccess = userRecord?.hasAccess ?? false;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={sidebarUser} hasAccess={hasAccess} />
      <main
        className="flex-1 overflow-auto relative"
        style={{ backgroundColor: '#FAF8F5' }}
      >
        <FreemiumGate hasAccess={hasAccess}>
          {children}
        </FreemiumGate>
      </main>
    </div>
  );
}

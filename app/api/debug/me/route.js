import { NextResponse } from 'next/server';
import { auth } from '@/libs/auth';
import connectMongo from '@/libs/mongoose';
import User from '@/models/User';
import configFile from '@/config';

/**
 * GET /api/debug/me
 * Returns the full User record from MongoDB for the logged-in user.
 * Protected by x-internal-secret header.
 * DELETE THIS ROUTE before going to production.
 */
export async function GET(request) {
  const secret = request.headers.get('x-internal-secret');
  if (!process.env.INTERNAL_SECRET || secret !== process.env.INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await connectMongo();

  const user = await User.findOne({ email: session.user.email }).lean();

  if (!user) {
    return NextResponse.json({ error: 'User not found in DB' }, { status: 404 });
  }

  return NextResponse.json({
    user: {
      _id: user._id,
      email: user.email,
      name: user.name,
      hasAccess: user.hasAccess,
      customerId: user.customerId ?? null,
      priceId: user.priceId ?? null,
      mrrBand: user.mrrBand ?? null,
      stripeConnectionId: user.stripeConnectionId ?? null,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    configuredPlans: configFile.stripe.plans.map((p) => ({
      name: p.name,
      priceId: p.priceId,
    })),
  });
}

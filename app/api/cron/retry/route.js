import { NextResponse } from 'next/server';
import connectMongo from '@/libs/mongoose';
import { getClientStripe } from '@/libs/stripeConnect';
import { computeRetryDate } from '@/libs/paydayRetry';
import { classifyDecline } from '@/libs/die';
import Invoice from '@/models/Invoice';
import StripeConnection from '@/models/StripeConnection';
import DunningSequence from '@/models/DunningSequence';
import Subscription from '@/models/Subscription';

const MAX_RETRIES = 3;

/**
 * GET /api/cron/retry
 * Hourly cron — retries all SOFT_TEMPORARY invoices whose nextRetryAt has passed.
 * Secured by Vercel's built-in CRON_SECRET header.
 */
export async function GET(request) {
  // Vercel injects Authorization: Bearer <CRON_SECRET> on cron invocations
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await connectMongo();

    const now = new Date();

    // Find all open SOFT_TEMPORARY invoices whose retry time has arrived
    const invoices = await Invoice.find({
      status: 'open',
      dieCategory: 'SOFT_TEMPORARY',
      nextRetryAt: { $lte: now },
      retryCount: { $lt: MAX_RETRIES },
    }).lean();

    let recovered = 0;
    let rescheduled = 0;
    let failed = 0;

    for (const inv of invoices) {
      const connection = await StripeConnection.findOne({ userId: inv.orgId }).lean();

      if (!connection || connection.syncStatus !== 'done') {
        continue;
      }

      const clientStripe = getClientStripe(connection.accessToken);

      try {
        // Attempt to pay the invoice via the connected account's Stripe client
        await clientStripe.invoices.pay(inv.stripeInvoiceId);

        // Success — mark recovered and stop dunning sequence
        await Invoice.findByIdAndUpdate(inv._id, {
          status: 'recovered',
          recoveredAt: now,
          nextRetryAt: null,
          lastRetryAt: now,
          $inc: { retryCount: 1 },
        });

        await stopDunningSequence(inv._id, 'payment_success');
        recovered++;

      } catch (stripeErr) {
        const newRetryCount = (inv.retryCount ?? 0) + 1;

        if (newRetryCount >= MAX_RETRIES) {
          // Exhausted retries — mark uncollectible, stop sequence
          await Invoice.findByIdAndUpdate(inv._id, {
            status: 'uncollectible',
            nextRetryAt: null,
            lastRetryAt: now,
            retryCount: newRetryCount,
          });

          await stopDunningSequence(inv._id, 'hard_failure');
          failed++;
        } else {
          // Re-classify in case failure code changed, then reschedule
          const newFailureCode = stripeErr?.raw?.decline_code ?? stripeErr?.raw?.code ?? null;
          const newCategory = classifyDecline(newFailureCode);

          // If re-classified as HARD or UPDATABLE, stop retrying
          if (newCategory !== 'SOFT_TEMPORARY') {
            await Invoice.findByIdAndUpdate(inv._id, {
              dieCategory: newCategory,
              failureCode: newFailureCode ?? inv.failureCode,
              nextRetryAt: null,
              lastRetryAt: now,
              retryCount: newRetryCount,
            });

            await stopDunningSequence(inv._id, newCategory === 'HARD_PERMANENT' ? 'hard_failure' : 'card_updated');
            failed++;
          } else {
            // Reschedule next retry
            const sub = await Subscription.findOne({
              stripeSubscriptionId: inv.stripeSubscriptionId,
              orgId: inv.orgId,
            }).lean();

            const { retryAt, source } = computeRetryDate({
              failedAt: now,
              inferredPaydayCycle: sub?.inferredPaydayCycle ?? null,
              customerCountry: sub?.cardCountry ?? null,
            });

            await Invoice.findByIdAndUpdate(inv._id, {
              nextRetryAt: retryAt,
              nextRetrySource: source,
              lastRetryAt: now,
              retryCount: newRetryCount,
            });

            rescheduled++;
          }
        }
      }
    }

    console.log(`[cron/retry] processed=${invoices.length} recovered=${recovered} rescheduled=${rescheduled} failed=${failed}`);

    return NextResponse.json({
      processed: invoices.length,
      recovered,
      rescheduled,
      failed,
    });

  } catch (error) {
    console.error('[cron/retry]', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function stopDunningSequence(invoiceId, reason) {
  await DunningSequence.findOneAndUpdate(
    { invoiceId, status: 'active' },
    {
      status: reason === 'payment_success' ? 'recovered' : 'stopped',
      stoppedAt: new Date(),
      stoppedReason: reason,
    }
  );
}

import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { decrypt } from '@/libs/encryption';
import { classifyDecline } from '@/libs/die';
import { computeHealthScore } from '@/libs/healthScore';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';

/**
 * Returns an authenticated Stripe client for a connected account.
 * IMPORTANT: This uses the decrypted client access token, NEVER STRIPE_SECRET_KEY.
 */
export function getClientStripe(encryptedAccessToken) {
  return new Stripe(decrypt(encryptedAccessToken));
}

/**
 * Wraps a Stripe list call with automatic retry on rate-limit (429).
 * Respects the Retry-After header when present.
 */
async function stripeListWithRetry(fn, maxRetries = 3) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (err) {
      if (err?.statusCode === 429 && attempt < maxRetries) {
        const retryAfterMs = err?.headers?.['retry-after']
          ? parseInt(err.headers['retry-after'], 10) * 1000
          : Math.min(1000 * 2 ** attempt, 30000);
        console.warn(`[stripeConnect] Rate limited, retrying in ${retryAfterMs}ms (attempt ${attempt + 1})`);
        await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
        attempt++;
      } else {
        throw err;
      }
    }
  }
}

/**
 * Computes the Monthly Recurring Revenue in cents from a Stripe subscription object.
 */
export function computeMRR(sub) {
  if (!sub.items?.data?.length) return 0;

  return sub.items.data.reduce((total, item) => {
    const amount = item.price?.unit_amount ?? 0;
    const quantity = item.quantity ?? 1;
    const interval = item.price?.recurring?.interval;
    const intervalCount = item.price?.recurring?.interval_count ?? 1;

    let monthlyAmount = amount * quantity;
    if (interval === 'year') {
      monthlyAmount = monthlyAmount / (12 * intervalCount);
    } else if (interval === 'week') {
      monthlyAmount = monthlyAmount * (52 / (12 * intervalCount));
    } else if (interval === 'day') {
      monthlyAmount = monthlyAmount * (365 / (12 * intervalCount));
    } else if (interval === 'month') {
      monthlyAmount = monthlyAmount / intervalCount;
    }

    return total + Math.round(monthlyAmount);
  }, 0);
}

/**
 * Full initial sync of a connected Stripe account.
 * Fetches all subscriptions + last 90 days of invoices (open + paid with prior failures).
 * Updates StripeConnection.syncStatus on completion.
 */
export async function syncStripeData(userId, stripeAccountId, encryptedAccessToken) {
  await connectMongo();

  const startTime = Date.now();
  const clientStripe = getClientStripe(encryptedAccessToken);

  console.log('[REVENANT:SYNC] ▶ Start', {
    userId,
    stripeAccountId,
    timestamp: new Date().toISOString(),
  });

  // ── 1. Sync all subscriptions ───────────────────────────────────────────────
  let hasMore = true;
  let startingAfter = undefined;
  let totalSubsFetched = 0;
  let totalSubsWritten = 0;

  while (hasMore) {
    let subs;
    try {
      subs = await stripeListWithRetry(() =>
        clientStripe.subscriptions.list({
          limit: 100,
          status: 'all',
          expand: ['data.default_payment_method', 'data.customer'],
          ...(startingAfter && { starting_after: startingAfter }),
        })
      );
    } catch (err) {
      console.error('[REVENANT:SYNC] ❌ Error', {
        step: 'fetch_subscriptions',
        error: err.message,
        stack: err.stack,
        stripeAccountId,
      });
      throw err;
    }

    totalSubsFetched += subs.data.length;

    console.log('[REVENANT:SYNC] Subscriptions fetched from Stripe', {
      page: startingAfter ?? 'first',
      count: subs.data.length,
      statuses: subs.data.map((s) => s.status),
      ids: subs.data.map((s) => s.id),
    });

    for (const sub of subs.data) {
      let cardMeta = {};

      if (sub.default_payment_method) {
        let pm;
        try {
          pm =
            typeof sub.default_payment_method === 'string'
              ? await stripeListWithRetry(() =>
                  clientStripe.paymentMethods.retrieve(sub.default_payment_method)
                )
              : sub.default_payment_method;
        } catch (err) {
          console.error('[REVENANT:SYNC] ❌ Error', {
            step: 'fetch_payment_method',
            subscriptionId: sub.id,
            error: err.message,
            stack: err.stack,
            stripeAccountId,
          });
          throw err;
        }

        cardMeta = {
          paymentMethodId: pm.id,
          cardBrand: pm.card?.brand ?? null,
          cardLast4: pm.card?.last4 ?? null,
          cardExpMonth: pm.card?.exp_month ?? null,
          cardExpYear: pm.card?.exp_year ?? null,
          cardCountry: pm.card?.country ?? null,
        };

        console.log('[REVENANT:SYNC] PaymentMethod fetched', {
          subscriptionId: sub.id,
          paymentMethodId: pm.id,
          cardBrand: pm.card?.brand ?? null,
          cardLast4: pm.card?.last4 ?? null,
          cardExpMonth: pm.card?.exp_month ?? null,
          cardExpYear: pm.card?.exp_year ?? null,
          cardCountry: pm.card?.country ?? null,
        });
      }

      const customer = typeof sub.customer === 'string' ? null : sub.customer;
      const mrr = computeMRR(sub);

      try {
        await Subscription.findOneAndUpdate(
          { stripeSubscriptionId: sub.id },
          {
            orgId: userId,
            stripeAccountId,
            stripeSubscriptionId: sub.id,
            stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
            customerEmail: customer?.email ?? null,
            customerName: customer?.name ?? null,
            status: sub.status,
            mrr,
            planId: sub.items?.data?.[0]?.price?.id ?? null,
            currentPeriodStart: sub.current_period_start
              ? new Date(sub.current_period_start * 1000)
              : null,
            currentPeriodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000)
              : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end ?? false,
            ...cardMeta,
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error('[REVENANT:SYNC] ❌ Error', {
          step: 'upsert_subscription',
          subscriptionId: sub.id,
          error: err.message,
          stack: err.stack,
          stripeAccountId,
        });
        throw err;
      }

      totalSubsWritten++;
      console.log('[REVENANT:SYNC] Subscription upserted', {
        stripeSubscriptionId: sub.id,
        status: sub.status,
        customerId: typeof sub.customer === 'string' ? sub.customer : sub.customer?.id,
        mrr,
        cardLast4: cardMeta.cardLast4 ?? null,
        cardExpMonth: cardMeta.cardExpMonth ?? null,
        cardExpYear: cardMeta.cardExpYear ?? null,
      });
    }

    hasMore = subs.has_more;
    if (hasMore) startingAfter = subs.data[subs.data.length - 1].id;
  }

  // ── 2. Sync invoices from the last 90 days ───────────────────────────────────
  // Single pass, no status filter — captures open, paid, uncollectible, void.
  // Mapping to DB status:
  //   open          → 'open'          (active failure, needs dunning)
  //   paid (retry>1)→ 'recovered'     (had a failure, then recovered)
  //   paid (retry=1)→ skip            (paid first try, not a failure case)
  //   uncollectible → 'uncollectible' (written off)
  //   void          → 'void'          (cancelled, no action needed)
  //   draft         → skip            (not finalized)
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;
  let totalInvoicesFetched = 0;
  let totalInvoicesWritten = 0;
  let totalInvoicesSkipped = 0;

  let invoiceHasMore = true;
  let invoiceStartingAfter = undefined;

  while (invoiceHasMore) {
    let page;
    try {
      page = await stripeListWithRetry(() =>
        clientStripe.invoices.list({
          limit: 100,
          created: { gte: since },
          expand: ['data.customer'],
          ...(invoiceStartingAfter && { starting_after: invoiceStartingAfter }),
        })
      );
    } catch (err) {
      console.error('[REVENANT:SYNC] ❌ Error', {
        step: 'fetch_invoices',
        error: err.message,
        stack: err.stack,
        stripeAccountId,
      });
      throw err;
    }

    totalInvoicesFetched += page.data.length;

    console.log('[REVENANT:SYNC] Invoices fetched from Stripe', {
      page: invoiceStartingAfter ?? 'first',
      count: page.data.length,
      ids: page.data.map((i) => i.id),
      byStatus: page.data.reduce((acc, i) => {
        acc[i.status] = (acc[i.status] ?? 0) + 1;
        return acc;
      }, {}),
      withPaymentError: page.data.filter((i) => !!i.last_payment_error).length,
      withoutPaymentError: page.data.filter((i) => !i.last_payment_error).length,
    });

    for (const inv of page.data) {
      // Determine DB status and whether to write this invoice
      let dbStatus;
      let skipReason = null;

      if (inv.status === 'open') {
        dbStatus = 'open';
      } else if (inv.status === 'paid') {
        if ((inv.attempt_count ?? 0) > 1) {
          dbStatus = 'recovered';
        } else {
          skipReason = 'paid_first_attempt'; // no failure, no value tracking it
        }
      } else if (inv.status === 'uncollectible') {
        dbStatus = 'uncollectible';
      } else if (inv.status === 'void') {
        dbStatus = 'void';
      } else {
        skipReason = `unsupported_status:${inv.status}`; // e.g. draft
      }

      console.log('[REVENANT:SYNC] Invoice evaluated', {
        stripeInvoiceId: inv.id,
        stripeStatus: inv.status,
        amount: inv.amount_due,
        attemptCount: inv.attempt_count ?? 0,
        hasPaymentError: !!inv.last_payment_error,
        errorCode: inv.last_payment_error?.code ?? null,
        willBeWrittenToDB: !skipReason,
        dbStatus: skipReason ? null : dbStatus,
        skipReason: skipReason ?? undefined,
      });

      if (skipReason) {
        totalInvoicesSkipped++;
        console.log('[REVENANT:SYNC] ⚠ Invoice SKIPPED', {
          stripeInvoiceId: inv.id,
          stripeStatus: inv.status,
          reason: skipReason,
        });
        continue;
      }

      const failureCode = inv.last_payment_error?.code ?? null;
      const dieCategory = classifyDecline(failureCode);
      const customer = typeof inv.customer === 'string' ? null : inv.customer;

      const failedAt = inv.status_transitions?.past_due_at
        ? new Date(inv.status_transitions.past_due_at * 1000)
        : null;

      const recoveredAt =
        dbStatus === 'recovered' && inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : null;

      try {
        await Invoice.findOneAndUpdate(
          { stripeInvoiceId: inv.id },
          {
            orgId: userId,
            stripeAccountId,
            stripeInvoiceId: inv.id,
            stripeSubscriptionId: inv.subscription ?? null,
            stripeCustomerId:
              typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
            customerEmail: customer?.email ?? inv.customer_email ?? null,
            customerName: customer?.name ?? inv.customer_name ?? null,
            amount: inv.amount_due,
            currency: inv.currency ?? 'usd',
            status: dbStatus,
            dieCategory,
            failureCode,
            failureMessage: inv.last_payment_error?.message ?? null,
            ...(failedAt && { failedAt }),
            ...(recoveredAt && { recoveredAt }),
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error('[REVENANT:SYNC] ❌ Error', {
          step: 'upsert_invoice',
          stripeInvoiceId: inv.id,
          error: err.message,
          stack: err.stack,
          stripeAccountId,
        });
        throw err;
      }

      totalInvoicesWritten++;
      console.log('[REVENANT:SYNC] Invoice upserted', {
        stripeInvoiceId: inv.id,
        dbStatus,
        dieCategory,
        failureCode,
        amount: inv.amount_due,
        failedAt: failedAt?.toISOString() ?? null,
        recoveredAt: recoveredAt?.toISOString() ?? null,
      });
    }

    invoiceHasMore = page.has_more;
    if (invoiceHasMore) invoiceStartingAfter = page.data[page.data.length - 1].id;
  }

  // ── 3. Compute Revenue Health Score ──────────────────────────────────────────
  const [activeSubs, openInvoices, totalInvoices, recoveredCount] = await Promise.all([
    Subscription.find({ orgId: userId, status: 'active' }).lean(),
    Invoice.find({ orgId: userId, status: 'open' }).lean(),
    Invoice.countDocuments({ orgId: userId }),
    Invoice.countDocuments({ orgId: userId, status: 'recovered' }),
  ]);

  const healthScore = computeHealthScore({
    activeSubs,
    openInvoices,
    totalInvoices,
    recoveredCount,
    hasConnection: true,
    userId,
  });

  // ── 4. Mark sync as complete ──────────────────────────────────────────────────
  await StripeConnection.findOneAndUpdate(
    { userId },
    {
      syncStatus: 'done',
      lastSyncAt: new Date(),
      syncError: null,
      healthScore: { ...healthScore, computedAt: new Date() },
    }
  );

  const duration = Date.now() - startTime;

  console.log('[REVENANT:SYNC] ✅ Complete', {
    stripeAccountId,
    totalSubscriptionsFetched: totalSubsFetched,
    totalSubscriptionsWritten: totalSubsWritten,
    totalInvoicesFetched,
    totalInvoicesWritten,
    totalInvoicesSkipped,
    healthScore: healthScore.total,
    duration: `${duration}ms`,
  });
}

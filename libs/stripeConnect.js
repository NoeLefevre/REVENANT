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
          : Math.min(1000 * 2 ** attempt, 30000); // exponential backoff, max 30s
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
 * Fetches all subscriptions + last 90 days of failed invoices.
 * Updates StripeConnection.syncStatus on completion.
 */
export async function syncStripeData(userId, stripeAccountId, encryptedAccessToken) {
  await connectMongo();

  const clientStripe = getClientStripe(encryptedAccessToken);

  // ── 1. Sync all subscriptions ───────────────────────────────────────────────
  let hasMore = true;
  let startingAfter = undefined;

  while (hasMore) {
    const subs = await stripeListWithRetry(() =>
      clientStripe.subscriptions.list({
        limit: 100,
        status: 'all',
        expand: ['data.default_payment_method', 'data.customer'],
        ...(startingAfter && { starting_after: startingAfter }),
      })
    );

    for (const sub of subs.data) {
      let cardMeta = {};

      if (sub.default_payment_method) {
        const pm =
          typeof sub.default_payment_method === 'string'
            ? await stripeListWithRetry(() =>
                clientStripe.paymentMethods.retrieve(sub.default_payment_method)
              )
            : sub.default_payment_method;

        cardMeta = {
          paymentMethodId: pm.id,
          cardBrand: pm.card?.brand ?? null,
          cardLast4: pm.card?.last4 ?? null,
          cardExpMonth: pm.card?.exp_month ?? null,
          cardExpYear: pm.card?.exp_year ?? null,
          cardCountry: pm.card?.country ?? null,
        };
      }

      const customer = typeof sub.customer === 'string' ? null : sub.customer;

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
          mrr: computeMRR(sub),
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
    }

    hasMore = subs.has_more;
    if (hasMore) {
      startingAfter = subs.data[subs.data.length - 1].id;
    }
  }

  // ── 2. Sync invoices from the last 90 days ───────────────────────────────────
  // Pulls two passes:
  //   a) status=open  → currently failing, need dunning action
  //   b) status=paid  → recovered invoices (attempt_count > 1 = had at least one failure)
  //      Gives recoveryRate an accurate historical baseline from day 1.
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;

  async function syncInvoicePage(status) {
    let hasMore = true;
    let startingAfter = undefined;
    let count = 0;

    while (hasMore) {
      const page = await stripeListWithRetry(() =>
        clientStripe.invoices.list({
          limit: 100,
          status,
          created: { gte: since },
          expand: ['data.customer'],
          ...(startingAfter && { starting_after: startingAfter }),
        })
      );

      for (const inv of page.data) {
        // For paid invoices: only import those with more than 1 attempt
        // (attempt_count > 1 means at least one payment failed before recovery)
        if (status === 'paid' && (inv.attempt_count ?? 0) <= 1) continue;

        const failureCode = inv.last_payment_error?.code ?? null;
        const dieCategory = classifyDecline(failureCode);
        const customer = typeof inv.customer === 'string' ? null : inv.customer;

        const failedAt = inv.status_transitions?.past_due_at
          ? new Date(inv.status_transitions.past_due_at * 1000)
          : null;

        const recoveredAt = status === 'paid' && inv.status_transitions?.paid_at
          ? new Date(inv.status_transitions.paid_at * 1000)
          : null;

        await Invoice.findOneAndUpdate(
          { stripeInvoiceId: inv.id },
          {
            orgId: userId,
            stripeAccountId,
            stripeInvoiceId: inv.id,
            stripeSubscriptionId: inv.subscription ?? null,
            stripeCustomerId: typeof inv.customer === 'string' ? inv.customer : inv.customer?.id,
            customerEmail: customer?.email ?? inv.customer_email ?? null,
            customerName: customer?.name ?? inv.customer_name ?? null,
            amount: inv.amount_due,
            currency: inv.currency ?? 'usd',
            status: status === 'paid' ? 'recovered' : 'open',
            dieCategory,
            failureCode,
            failureMessage: inv.last_payment_error?.message ?? null,
            ...(failedAt && { failedAt }),
            ...(recoveredAt && { recoveredAt }),
          },
          { upsert: true, new: true }
        );
        count++;
      }

      hasMore = page.has_more;
      if (hasMore) startingAfter = page.data[page.data.length - 1].id;
    }

    console.log(`[syncStripeData] invoices status=${status} written=${count}`);
  }

  await syncInvoicePage('open');
  await syncInvoicePage('paid');

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
}

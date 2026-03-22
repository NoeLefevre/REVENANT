import Stripe from 'stripe';
import connectMongo from '@/libs/mongoose';
import { decrypt } from '@/libs/encryption';
import { classifyDecline } from '@/libs/die';
import StripeConnection from '@/models/StripeConnection';
import Subscription from '@/models/Subscription';
import Invoice from '@/models/Invoice';

/**
 * Returns an authenticated Stripe client for a connected account.
 * IMPORTANT: This uses the decrypted client access token, NEVER STRIPE_SECRET_KEY.
 *
 * @param {string} encryptedAccessToken - The encrypted access token from StripeConnection
 * @returns {Stripe}
 */
export function getClientStripe(encryptedAccessToken) {
  return new Stripe(decrypt(encryptedAccessToken));
}

/**
 * Computes the Monthly Recurring Revenue in cents from a Stripe subscription object.
 *
 * @param {Object} sub - Stripe subscription object
 * @returns {number} MRR in cents
 */
function computeMRR(sub) {
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
 *
 * @param {string} userId - REVENANT User._id (as string)
 * @param {string} stripeAccountId - e.g. 'acct_xxx'
 * @param {string} encryptedAccessToken - AES-256-GCM encrypted access token from StripeConnection
 */
export async function syncStripeData(userId, stripeAccountId, encryptedAccessToken) {
  await connectMongo();

  // Use the CLIENT's Stripe client — never REVENANT's STRIPE_SECRET_KEY
  const clientStripe = getClientStripe(encryptedAccessToken);

  // ── 1. Sync all subscriptions ───────────────────────────────────────────────
  let hasMore = true;
  let startingAfter = undefined;

  while (hasMore) {
    const subs = await clientStripe.subscriptions.list({
      limit: 100,
      status: 'all',
      expand: ['data.default_payment_method', 'data.customer'],
      ...(startingAfter && { starting_after: startingAfter }),
    });

    for (const sub of subs.data) {
      let cardMeta = {};

      // Retrieve card metadata from the default payment method
      if (sub.default_payment_method) {
        const pm =
          typeof sub.default_payment_method === 'string'
            ? await clientStripe.paymentMethods.retrieve(sub.default_payment_method)
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

  // ── 2. Sync last 90 days of failed (open) invoices ──────────────────────────
  const since = Math.floor(Date.now() / 1000) - 90 * 86400;

  let invoiceHasMore = true;
  let invoiceStartingAfter = undefined;

  while (invoiceHasMore) {
    const invoices = await clientStripe.invoices.list({
      limit: 100,
      status: 'open',
      created: { gte: since },
      expand: ['data.customer'],
      ...(invoiceStartingAfter && { starting_after: invoiceStartingAfter }),
    });

    for (const inv of invoices.data) {
      // Only process invoices that actually failed a payment attempt
      if (!inv.last_payment_error) continue;

      const failureCode = inv.last_payment_error?.code ?? null;
      const dieCategory = classifyDecline(failureCode);

      const customer = typeof inv.customer === 'string' ? null : inv.customer;

      const failedAt = inv.status_transitions?.past_due_at
        ? new Date(inv.status_transitions.past_due_at * 1000)
        : new Date();

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
          status: 'open',
          dieCategory,
          failureCode,
          failureMessage: inv.last_payment_error?.message ?? null,
          failedAt,
        },
        { upsert: true, new: true }
      );
    }

    invoiceHasMore = invoices.has_more;
    if (invoiceHasMore) {
      invoiceStartingAfter = invoices.data[invoices.data.length - 1].id;
    }
  }

  // ── 3. Mark sync as complete ─────────────────────────────────────────────────
  await StripeConnection.findOneAndUpdate(
    { userId },
    { syncStatus: 'done', lastSyncAt: new Date(), syncError: null }
  );
}

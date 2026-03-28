/**
 * Computes the Revenue Safety Score (0-100) from synced MongoDB data.
 *
 * Dimensions (each 0-100):
 * - expiryRisk:    % of active subs whose card is NOT expiring within 30 days
 * - failureRate:   % of total invoices that are NOT currently open/failing
 * - recoveryRate:  % of ever-failed invoices that were recovered
 * - customerRisk:  average recovery score across active subscriptions
 * - dunningConfig: boolean — whether Stripe is connected (has dunning capability)
 *
 * Total = average of the four numeric dimensions (dunningConfig adds +5 bonus if true).
 *
 * @param {Object} params
 * @param {Array}  params.activeSubs       - Array of Subscription docs (lean)
 * @param {Array}  params.openInvoices     - Array of Invoice docs with status='open'
 * @param {number} params.totalInvoices    - Count of all invoices for this org
 * @param {number} params.recoveredCount   - Count of invoices with status='recovered'
 * @param {boolean} params.hasConnection   - Whether a StripeConnection with syncStatus='done' exists
 * @returns {{ total: number, dimensions: Object, pills: string[] }}
 */
export function computeHealthScore({
  activeSubs,
  openInvoices,
  totalInvoices,
  recoveredCount,
  hasConnection,
}) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Expiry Risk: percentage of active subs with cards NOT expiring within 30 days
  let expiryRisk = 100;
  if (activeSubs.length > 0) {
    const expiringCards = activeSubs.filter((s) => {
      if (!s.cardExpMonth || !s.cardExpYear) return false;
      // Last day of expiry month
      const cardExpiry = new Date(s.cardExpYear, s.cardExpMonth, 0, 23, 59, 59);
      return cardExpiry <= in30Days;
    });
    expiryRisk = Math.max(0, 100 - Math.round((expiringCards.length / activeSubs.length) * 100));
  }

  // Failure Rate: percentage of total invoices NOT currently failing
  const failureRate =
    totalInvoices > 0
      ? Math.max(0, 100 - Math.round((openInvoices.length / totalInvoices) * 100))
      : 100;

  // Recovery Rate: recovered / (open + recovered)
  // Default to 100 when there is no failure history — a merchant with zero failures
  // has a perfect recovery rate, not a zero one.
  const denominator = openInvoices.length + recoveredCount;
  const recoveryRate = denominator > 0 ? Math.round((recoveredCount / denominator) * 100) : 100;

  // Customer Risk: average recovery score across active subs (default 50 if unknown)
  const customerRisk =
    activeSubs.length > 0
      ? Math.round(
          activeSubs.reduce((sum, s) => sum + (s.recoveryScore ?? 50), 0) / activeSubs.length
        )
      : 50;

  const dunningConfig = hasConnection;

  // Total = average of 4 numeric dimensions + small bonus for dunning setup
  const base = Math.round((expiryRisk + failureRate + recoveryRate + customerRisk) / 4);
  const total = Math.min(100, dunningConfig ? base + 5 : base);

  // Shareable pills
  const pills = [];
  if (activeSubs.length > 0) pills.push(`${activeSubs.length} customers`);
  const totalMrr = activeSubs.reduce((sum, s) => sum + (s.mrr ?? 0), 0);
  if (totalMrr > 0) {
    pills.push(
      `${(totalMrr / 100).toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
      })} MRR`
    );
  }

  return {
    total,
    dimensions: { expiryRisk, failureRate, recoveryRate, customerRisk, dunningConfig },
    pills,
  };
}

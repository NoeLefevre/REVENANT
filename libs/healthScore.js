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
 * @param {Object}  params
 * @param {Array}   params.activeSubs     - Array of Subscription docs (lean)
 * @param {Array}   params.openInvoices   - Array of Invoice docs with status='open'
 * @param {number}  params.totalInvoices  - Count of all invoices for this org
 * @param {number}  params.recoveredCount - Count of invoices with status='recovered'
 * @param {boolean} params.hasConnection  - Whether a StripeConnection with syncStatus='done' exists
 * @param {string}  [params.userId]       - Optional: logged in score logs for traceability
 * @returns {{ total: number, dimensions: Object, pills: string[] }}
 */
export function computeHealthScore({
  activeSubs,
  openInvoices,
  totalInvoices,
  recoveredCount,
  hasConnection,
  userId,
}) {
  const now = new Date();
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // ── Expiry Risk ───────────────────────────────────────────────────────────────
  let expiryRisk = 100;
  const expiringCards = activeSubs.filter((s) => {
    if (!s.cardExpMonth || !s.cardExpYear) return false;
    const cardExpiry = new Date(s.cardExpYear, s.cardExpMonth, 0, 23, 59, 59);
    return cardExpiry <= in30Days;
  });
  if (activeSubs.length > 0) {
    expiryRisk = Math.max(0, 100 - Math.round((expiringCards.length / activeSubs.length) * 100));
  }

  // ── Failure Rate ──────────────────────────────────────────────────────────────
  const failureRate =
    totalInvoices > 0
      ? Math.max(0, 100 - Math.round((openInvoices.length / totalInvoices) * 100))
      : 100;

  // ── Recovery Rate ─────────────────────────────────────────────────────────────
  // Default to 100 when there is no failure history — a merchant with zero failures
  // has a perfect recovery rate, not a zero one.
  const denominator = openInvoices.length + recoveredCount;
  const recoveryRate = denominator > 0 ? Math.round((recoveredCount / denominator) * 100) : 100;

  // ── Customer Risk ─────────────────────────────────────────────────────────────
  const customerRisk =
    activeSubs.length > 0
      ? Math.round(
          activeSubs.reduce((sum, s) => sum + (s.recoveryScore ?? 50), 0) / activeSubs.length
        )
      : 50;

  const dunningConfig = hasConnection;

  // ── Total ─────────────────────────────────────────────────────────────────────
  const base = Math.round((expiryRisk + failureRate + recoveryRate + customerRisk) / 4);
  const total = Math.min(100, dunningConfig ? base + 5 : base);

  // ── Shareable pills ───────────────────────────────────────────────────────────
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

  console.log('[REVENANT:SCORE] Input data', {
    userId: userId ?? 'unknown',
    totalActiveSubs: activeSubs.length,
    subsWithCardData: activeSubs.filter((s) => s.cardExpMonth && s.cardExpYear).length,
    subsExpiringIn30d: expiringCards.length,
    totalInvoices,
    openInvoices: openInvoices.length,
    recoveredInvoices: recoveredCount,
    subsWithRecoveryScore: activeSubs.filter((s) => s.recoveryScore !== null && s.recoveryScore !== undefined).length,
    hasDunningConfigured: dunningConfig,
  });

  console.log('[REVENANT:SCORE] Dimension scores', {
    userId: userId ?? 'unknown',
    expiryRisk,
    failureRate,
    recoveryRate,
    customerRisk,
    dunningBonus: dunningConfig ? 5 : 0,
    base,
  });

  console.log('[REVENANT:SCORE] ✅ Final score', {
    score: total,
    dimensions: { expiryRisk, failureRate, recoveryRate, customerRisk, dunningConfig },
    userId: userId ?? 'unknown',
  });

  return {
    total,
    dimensions: { expiryRisk, failureRate, recoveryRate, customerRisk, dunningConfig },
    pills,
  };
}

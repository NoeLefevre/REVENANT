/**
 * Computes Recovery Score (0-100) from Stripe data only.
 * Higher score = more valuable customer = recover with more effort.
 *
 * Scoring:
 * - Tenure > 12 months:          +30 pts
 * - Zero payment incidents:       +25 pts
 * - MRR > $100/mo ($10000 cents): +20 pts
 * - Failure type SOFT_UPDATABLE:  +15 pts (card issue = fixable)
 * - No downgrade/refund in 90d:   +10 pts
 *
 * @param {Object} params
 * @param {number} params.tenureMonths - How long the customer has been subscribed
 * @param {boolean} params.hasIncidents - Any past failed invoices
 * @param {number} params.mrrCents - Current MRR in cents
 * @param {string} params.dieCategory - 'SOFT_TEMPORARY' | 'SOFT_UPDATABLE' | 'HARD_PERMANENT'
 * @param {boolean} params.hasRecentDowngrade - Downgrade or refund in last 90 days
 * @returns {number} Score between 0 and 100
 */
export function computeRecoveryScore({
  tenureMonths,
  hasIncidents,
  mrrCents,
  dieCategory,
  hasRecentDowngrade,
}) {
  let score = 0;
  if (tenureMonths > 12) score += 30;
  if (!hasIncidents) score += 25;
  if (mrrCents >= 10000) score += 20;
  if (dieCategory === 'SOFT_UPDATABLE') score += 15;
  if (!hasRecentDowngrade) score += 10;
  return Math.min(score, 100);
}

/**
 * Returns the recovery tier label for a given score.
 *
 * @param {number} score
 * @returns {'HIGH_VALUE' | 'STANDARD' | 'LOW_PRIORITY'}
 */
export function getRecoveryTier(score) {
  if (score >= 70) return 'HIGH_VALUE';
  if (score >= 40) return 'STANDARD';
  return 'LOW_PRIORITY';
}

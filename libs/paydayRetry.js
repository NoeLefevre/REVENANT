// Country-based payday benchmarks (day of month)
const COUNTRY_PAYDAY = {
  US: 1,  // 1st or 15th — default to 1st
  GB: 25,
  FR: 28,
  DE: 1,
  CA: 15,
  AU: 15,
};

/**
 * Given a failed invoice and subscription history, compute the optimal retry date.
 * For SOFT_TEMPORARY only — SOFT_UPDATABLE should NOT be retried automatically.
 *
 * @param {Object} params
 * @param {Date} params.failedAt - When the invoice failed
 * @param {string|null} params.inferredPaydayCycle - e.g. '5' if inferred, null if unknown
 * @param {string} params.customerCountry - ISO country code from card metadata
 * @returns {{ retryAt: Date, source: string }}
 */
export function computeRetryDate({ failedAt, inferredPaydayCycle, customerCountry }) {
  const now = new Date(failedAt);

  // 1. Use inferred payday if available
  if (inferredPaydayCycle) {
    const payday = parseInt(inferredPaydayCycle, 10);
    return {
      retryAt: nextOccurrenceOfDay(now, payday),
      source: 'payday_inferred',
    };
  }

  // 2. Country benchmark fallback
  const benchmarkDay = COUNTRY_PAYDAY[customerCountry];
  if (benchmarkDay) {
    return {
      retryAt: nextOccurrenceOfDay(now, benchmarkDay),
      source: 'country_benchmark',
    };
  }

  // 3. Default: retry in 24h
  const retryAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  return { retryAt, source: 'default' };
}

function nextOccurrenceOfDay(fromDate, dayOfMonth) {
  const d = new Date(fromDate);
  d.setDate(dayOfMonth);
  // If that day is already past this month, go to next month
  if (d <= fromDate) {
    d.setMonth(d.getMonth() + 1);
    d.setDate(dayOfMonth);
  }
  // Retry at 9:00 AM with 2-hour buffer
  d.setHours(9, 0, 0, 0);
  return d;
}

/**
 * Infer payday from a customer's successful payment history.
 * Looks for consistent payment day across last 3+ successful charges.
 * Returns day-of-month string if consistent, null otherwise.
 *
 * @param {Date[]} successfulChargeDates
 * @returns {string|null}
 */
export function inferPaydayCycle(successfulChargeDates) {
  if (!successfulChargeDates || successfulChargeDates.length < 3) return null;
  const days = successfulChargeDates.map((d) => new Date(d).getDate());
  const mostCommon = mode(days);
  const consistency =
    days.filter((d) => Math.abs(d - mostCommon) <= 2).length / days.length;
  return consistency >= 0.7 ? String(mostCommon) : null;
}

function mode(arr) {
  const freq = {};
  arr.forEach((v) => {
    freq[v] = (freq[v] || 0) + 1;
  });
  return parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
}

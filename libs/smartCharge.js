/**
 * SmartCharge — Trial Guard logic
 *
 * Assesses the risk of a trial subscription and manages
 * pre-authorization holds on high-risk payment methods.
 */

/**
 * Evaluates the fraud/churn risk of a trial based on the payment method
 * and subscription object from Stripe.
 *
 * @param {object} pm             - Stripe PaymentMethod object (expanded)
 * @param {object} sub            - Stripe Subscription object
 * @param {number} radarThreshold - Radar score above which a card is flagged (default: 65)
 * @returns {{ isHighRisk: boolean, risks: string[] }}
 */
export function assessTrialRisk(pm, sub, radarThreshold = 65) {
  const risks = [];

  // Signal 1 — Prepaid card (high chargeback / no funds risk)
  if (pm.card?.funding === 'prepaid') {
    risks.push('prepaid_card');
  }

  // Signal 2 — Card expires before trial ends
  if (pm.card?.exp_month && pm.card?.exp_year && sub.trial_end) {
    const cardExpiry = new Date(pm.card.exp_year, pm.card.exp_month - 1, 28);
    const trialEnd = new Date(sub.trial_end * 1000);
    if (cardExpiry < trialEnd) {
      risks.push('card_expires_before_trial_end');
    }
  }

  // Signal 3 — High Stripe Radar risk score
  const radarScore = pm.card?.checks?.radar_risk_score;
  if (radarScore != null && radarScore >= radarThreshold) {
    risks.push('high_radar_score');
  }

  return {
    isHighRisk: risks.length > 0,
    risks,
  };
}

/**
 * Computes a 0–100 trust score for a trial based on its risk signals.
 * 100 = clean, 0 = maximum risk.
 *
 * Weights (cumulative deductions from 100):
 *   prepaid_card                  → −40
 *   card_expires_before_trial_end → −35
 *   high_radar_score              → −25
 *
 * @param {string[]} riskSignals - Array of risk signal keys
 * @returns {number} Score between 0 and 100
 */
export function computeTrialScore(riskSignals) {
  const weights = {
    prepaid_card:                  40,
    card_expires_before_trial_end: 35,
    high_radar_score:              25,
  };
  const deduction = riskSignals.reduce((sum, sig) => sum + (weights[sig] ?? 10), 0);
  return Math.max(0, 100 - deduction);
}

/**
 * Creates a manual-capture PaymentIntent (pre-authorization hold).
 *
 * Uses capture_method: 'manual' so funds are only reserved, not charged.
 * If the card requires 3DS/SCA, we log and return null — we never block
 * a trial for authentication friction.
 *
 * @param {object} clientStripe   - Stripe client authenticated as the connected account
 * @param {object} options
 * @param {string} options.customerId
 * @param {string} options.paymentMethodId
 * @param {string} options.stripeAccountId  - For logging only
 * @param {number} options.amount           - In cents (default: 100)
 * @returns {object|null} PaymentIntent or null on failure
 */
export async function createPreAuth(clientStripe, { customerId, paymentMethodId, stripeAccountId, amount }) {
  try {
    const paymentIntent = await clientStripe.paymentIntents.create({
      amount,
      currency: 'usd',
      customer: customerId,
      payment_method: paymentMethodId,
      capture_method: 'manual',
      confirm: true,
      off_session: true,
    });

    // 3DS/SCA required — do not block the trial, mark as failed
    if (paymentIntent.status === 'requires_action') {
      console.warn('[REVENANT:SMARTCHARGE] Pre-auth requires 3DS — skipping hold', {
        customerId,
        stripeAccountId,
        paymentIntentId: paymentIntent.id,
      });
      return null;
    }

    if (paymentIntent.status === 'requires_capture') {
      return paymentIntent;
    }

    // Unexpected status
    console.warn('[REVENANT:SMARTCHARGE] Pre-auth unexpected status', {
      status: paymentIntent.status,
      paymentIntentId: paymentIntent.id,
      stripeAccountId,
    });
    return null;

  } catch (err) {
    console.error('[REVENANT:SMARTCHARGE] createPreAuth failed', {
      customerId,
      stripeAccountId,
      error: err.message,
    });
    return null;
  }
}

/**
 * Captures a pre-authorization hold (converts hold to actual charge).
 * Called when a trial converts to an active subscription.
 *
 * @param {object} clientStripe     - Stripe client authenticated as the connected account
 * @param {string} paymentIntentId
 * @param {string} stripeAccountId  - For logging only
 * @returns {boolean}
 */
export async function capturePreAuth(clientStripe, paymentIntentId, stripeAccountId) {
  try {
    const captured = await clientStripe.paymentIntents.capture(paymentIntentId);
    return captured.status === 'succeeded';
  } catch (err) {
    console.error('[REVENANT:SMARTCHARGE] capturePreAuth failed', {
      paymentIntentId,
      stripeAccountId,
      error: err.message,
    });
    return false;
  }
}

/**
 * Cancels a pre-authorization hold, releasing the customer's reserved funds.
 * Called when a trial is cancelled before conversion.
 *
 * @param {object} clientStripe     - Stripe client authenticated as the connected account
 * @param {string} paymentIntentId
 * @param {string} stripeAccountId  - For logging only
 * @returns {boolean}
 */
export async function cancelPreAuth(clientStripe, paymentIntentId, stripeAccountId) {
  try {
    const cancelled = await clientStripe.paymentIntents.cancel(paymentIntentId);
    return cancelled.status === 'canceled';
  } catch (err) {
    console.error('[REVENANT:SMARTCHARGE] cancelPreAuth failed', {
      paymentIntentId,
      stripeAccountId,
      error: err.message,
    });
    return false;
  }
}

// HARD: never retry, never email, log only
const HARD_CODES = new Set([
  'fraudulent',
  'stolen_card',
  'lost_card',
  'pickup_card',
  'restricted_card',
  'security_violation',
  'revocation_of_all_authorizations',
  'revocation_of_authorization',
  'do_not_honor',
]);

// UPDATABLE: card issue, customer must update payment method
const UPDATABLE_CODES = new Set([
  'expired_card',
  'incorrect_cvc',
  'incorrect_number',
  'incorrect_zip',
  'card_not_supported',
  'invalid_expiry_month',
  'invalid_expiry_year',
  'invalid_number',
  'invalid_cvc',
]);

// TEMPORARY: likely transient (insufficient funds, etc.) → retry + email
export function classifyDecline(failureCode) {
  if (!failureCode) return 'SOFT_TEMPORARY';
  if (HARD_CODES.has(failureCode)) return 'HARD_PERMANENT';
  if (UPDATABLE_CODES.has(failureCode)) return 'SOFT_UPDATABLE';
  return 'SOFT_TEMPORARY';
}

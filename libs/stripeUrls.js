const BASE_LIVE = 'https://dashboard.stripe.com';
const BASE_TEST = 'https://dashboard.stripe.com/test';

function base(isLiveMode) {
  return isLiveMode ? BASE_LIVE : BASE_TEST;
}

export function getStripeCustomerUrl(customerId, isLiveMode) {
  return `${base(isLiveMode)}/customers/${customerId}`;
}

export function getStripeInvoiceUrl(invoiceId, isLiveMode) {
  return `${base(isLiveMode)}/invoices/${invoiceId}`;
}

export function getStripeSubscriptionUrl(subscriptionId, isLiveMode) {
  return `${base(isLiveMode)}/subscriptions/${subscriptionId}`;
}

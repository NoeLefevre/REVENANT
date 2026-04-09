# REVENANT — Trial Guard Developer Brief
### Version: 1.0 — April 2026

---

## 1. PRODUCT CONTEXT

REVENANT is a revenue protection SaaS for Stripe. The MVP is focused on a single feature: **Trial Guard**.

Trial Guard is a silent payment verification layer that runs on every trial signup. It ensures every user who enters a trial has a real card that can actually pay at conversion. The founder connects their Stripe account via OAuth and Trial Guard activates automatically.

**Core promise:** Every trial that starts with REVENANT is backed by a real payment. Guaranteed.

---

## 2. TECH STACK

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Boilerplate | ShipFast |
| Database | MongoDB (Mongoose) |
| Email | Resend |
| Background jobs | Vercel Cron |
| Payments | Stripe Connect OAuth |
| Hosting | Vercel |

**Already in place:**
- Stripe Connect OAuth flow
- Webhook handler at `/api/webhook/stripe-connect`
- MongoDB models: StripeConnection, Subscription, Invoice, DunningSequence
- Vercel deployment

---

## 3. TRIAL GUARD — HOW IT WORKS

### Default mode (active for all signups)

By default, Trial Guard places a silent hold on every trial signup without exception. This guarantees 100% of trials are backed by a real payment.

### Selective mode (optional, configurable in settings)

The founder can switch to selective mode in REVENANT settings. In this mode, Trial Guard only places a hold on signups that have at least one risk signal detected. This reduces friction for low-risk customers at the cost of a less absolute guarantee.

---

## 4. TECHNICAL FLOW

### Trigger

Event: `customer.subscription.created` with `status: trialing`

### Step 1 — Risk Scan

On every new trial subscription, scan 3 signals:

| Signal | How to detect | Risk level |
|---|---|---|
| Card funding type | `payment_method.card.funding === 'prepaid'` | High |
| Card expiry vs trial end | `card.exp_month/year` expires before `trial_end` date | High |
| Stripe Radar score | `payment_method.card.checks.risk_score` above threshold | High |

Note: Radar score always returns 0 in test mode. Only testable in production.

### Step 2 — Decision

**Default mode (universal):**
Place a hold on every signup regardless of risk signals.

**Selective mode:**
If at least one risk signal is detected: place a hold.
If no risk signal: add to standard monitoring queue only, no hold.

### Step 3 — Place the Hold

Create a PaymentIntent with `capture_method: manual` for the exact amount of the subscription plan.

```js
const paymentIntent = await stripe.paymentIntents.create({
  amount: subscriptionAmount, // exact plan amount in cents
  currency: subscriptionCurrency,
  customer: customerId,
  payment_method: paymentMethodId,
  capture_method: 'manual',
  confirm: true,
}, {
  stripeAccount: connectedAccountId // the connected Stripe account
})
```

Store the `paymentIntent.id` in MongoDB linked to the subscription.

### Step 4 — On Subscription Converted (trial ends, subscription becomes active)

Event: `customer.subscription.updated` where `status` changes from `trialing` to `active`

Capture the PaymentIntent:

```js
await stripe.paymentIntents.capture(paymentIntentId, {}, {
  stripeAccount: connectedAccountId
})
```

This turns the hold into the real first payment. No second charge attempt needed.

### Step 5 — On Subscription Cancelled (during trial)

Event: `customer.subscription.deleted` or `customer.subscription.updated` where `status` becomes `canceled`

Cancel the PaymentIntent to release the hold:

```js
await stripe.paymentIntents.cancel(paymentIntentId, {}, {
  stripeAccount: connectedAccountId
})
```

### Step 6 — On Hold Failure

If the PaymentIntent creation fails (card declined, insufficient funds, 3DS required):

**Default mode:** Block the trial signup. Return an error to the frontend. Do not grant trial access.

**Selective mode:** Same behavior. If the hold fails, the signup is blocked.

Log the failure in MongoDB with the decline reason.

---

## 5. 3DS / SCA HANDLING (CRITICAL FOR EUROPEAN CARDS)

European cards (especially French banks) frequently require 3DS authentication. This must be handled gracefully. **Blocking 3DS cards is not an option** — it would block the majority of European customers, making REVENANT unusable for any SaaS with European users.

The only acceptable approach is the **redirect flow**.

### How it works

When creating the PaymentIntent, if 3DS is required Stripe returns `status: requires_action` instead of `succeeded`.

```js
if (paymentIntent.status === 'requires_action') {
  const redirectUrl = paymentIntent.next_action.redirect_to_url.url
  // Return this URL to the frontend
  // The user is redirected to their bank's 3DS authentication page
}
```

### Full 3DS flow

1. REVENANT creates the PaymentIntent with `capture_method: manual`
2. Stripe returns `status: requires_action` for European cards
3. REVENANT returns the `next_action.redirect_to_url` to the frontend
4. The user is redirected to their bank's 3DS authentication page
5. The bank redirects back to a REVENANT confirmation URL after authentication
6. REVENANT checks the PaymentIntent status on the confirmation URL:
   - `status: requires_capture` — authentication succeeded, hold is active, grant trial access
   - `status: canceled` or `payment_failed` — authentication failed, block trial signup
7. Store the final PaymentIntent status in MongoDB

### Confirmation URL to implement

Create a route at `/api/trial-guard/confirm?payment_intent=xxx` that:
1. Retrieves the PaymentIntent from Stripe
2. Checks its status
3. Updates the subscription record in MongoDB
4. Redirects the user to the product (trial granted) or an error page (trial blocked)

### Important note on user experience

The 3DS redirect happens immediately after the user submits their card at trial signup. It is a standard bank authentication step that European users are familiar with. It does not create unusual friction — it is the same flow they experience when making any online purchase.

---

## 6. CRITICAL CONSTRAINTS

| Constraint | Detail |
|---|---|
| Maximum hold duration | 7 days. Stripe automatically cancels holds after 7 days. |
| Trial duration | REVENANT only supports trials of 7 days or less. Do not activate Trial Guard for trials longer than 7 days. |
| Idempotency | Use idempotency keys on all PaymentIntent operations to prevent duplicate charges. |
| Webhook ordering | Webhooks can arrive out of order. Always check subscription status in DB before acting. |
| Test mode limitation | Radar risk score always returns 0 in test mode. Selective mode risk detection cannot be fully tested without production data. |

---

## 7. WEBHOOK EVENTS TO HANDLE

| Event | Action |
|---|---|
| `customer.subscription.created` (status: trialing) | Run risk scan, place hold |
| `customer.subscription.updated` (trialing to active) | Capture PaymentIntent |
| `customer.subscription.updated` (trialing to canceled) | Cancel PaymentIntent |
| `customer.subscription.deleted` | Cancel PaymentIntent if hold still active |
| `payment_intent.succeeded` | Log successful hold, update DB |
| `payment_intent.payment_failed` | Log failure, block trial, update DB |

All events arrive at: `/api/webhook/stripe-connect`
Webhook secret variable: `STRIPE_CONNECT_WEBHOOK_SECRET`

---

## 8. DATA MODEL

### New fields to add to Subscription model

```js
{
  trialGuardEnabled: Boolean,       // is Trial Guard active for this subscription
  trialGuardMode: String,           // 'universal' or 'selective'
  riskSignals: [String],            // list of detected risk signals
  paymentIntentId: String,          // Stripe PaymentIntent ID for the hold
  paymentIntentStatus: String,      // 'pending', 'held', 'captured', 'cancelled', 'failed'
  holdAmount: Number,               // amount held in cents
  holdCurrency: String,
  holdCreatedAt: Date,
  holdExpiresAt: Date,              // holdCreatedAt + 7 days
}
```

### New fields to add to StripeConnection model

```js
{
  trialGuardMode: String,           // 'universal' (default) or 'selective'
  trialGuardActive: Boolean,        // true by default on connection
}
```

---

## 9. DASHBOARD (MVP)

Single page. Shows:

- Total trials protected this month
- Bad cards blocked (holds that failed)
- Successful conversions backed by Trial Guard
- Active holds (trials currently in progress)

No complex analytics needed for MVP. Simple counters pulled from MongoDB.

---

## 10. SETTINGS PAGE

Single toggle visible to the founder:

**Trial Guard Mode**
- Universal (default): Every trial signup is verified. Maximum protection.
- Selective: Only risky signups are verified. Less friction for good customers.

---

## 11. ENVIRONMENT VARIABLES

```env
STRIPE_SECRET_KEY=                    # REVENANT platform Stripe key
STRIPE_CLIENT_ID=                     # Stripe Connect app client ID
STRIPE_CONNECT_WEBHOOK_SECRET=        # Connect webhook signing secret
NEXTAUTH_SECRET=
NEXTAUTH_URL=
MONGODB_URI=
RESEND_API_KEY=
```

---

## 12. TESTING

### Test cards to use

| Card | Behavior | Test scenario |
|---|---|---|
| `pm_card_visa` | Always succeeds | Low-risk signup, hold succeeds |
| `pm_card_chargeDeclinedInsufficientFunds` | Insufficient funds | Hold fails, trial blocked |
| `pm_card_chargeDeclinedExpiredCard` | Expired card | Hold fails, trial blocked |
| `pm_card_chargeDeclinedFraudulent` | Fraudulent | Hold fails, trial blocked |
| `pm_card_threeDSecure2Required` | Requires 3DS | Test 3DS handling |

### Seed script

A seed script is available at `scripts/seed.js`. It creates 5 test customers in the connected test Stripe account with different card scenarios. Run with:

```bash
node scripts/seed.js
```

### Key scenarios to test

1. Universal mode: good card, hold succeeds, trial converts, PaymentIntent captured
2. Universal mode: bad card, hold fails, trial blocked
3. Universal mode: trial cancelled, PaymentIntent cancelled
4. Selective mode: no risk signal, no hold, trial proceeds normally
5. Selective mode: risk signal detected, hold placed, same flow as universal

REVENANT — Developer Brief v3
Revenue Protection SaaS for Stripe
Version: 3.0 — March 2026
---
1. PRODUCT OVERVIEW
REVENANT is a B2B SaaS that connects to a founder's Stripe account via OAuth and protects revenue through three layers: auditing, prevention, and recovery.
Tagline: Protect your MRR before Stripe tells you it's gone.
Target user: Solo founder or small team ($5K–$30K MRR), B2B SaaS on Stripe Billing.
Core value prop: Every competitor acts after payment fails. REVENANT acts before.
---
2. TECH STACK
Layer	Technology
Framework	Next.js 15 (App Router)
Boilerplate	ShipFast
Auth	NextAuth.js
Database	MongoDB (Mongoose)
Email	Resend
Background jobs	Vercel Cron
Payments	Stripe Connect OAuth
Hosting	Vercel
---
3. STRIPE INTEGRATION
Connection method: Stripe Connect OAuth (not API key input).
Why OAuth: Grants read + limited write access to the merchant's Stripe account. Allows REVENANT to act on their behalf (retry charges, send dunning emails referencing real invoice data).
Stripe webhook events consumed:
Event	Purpose
`customer.subscription.created`	Detect new trial signups → trigger Trial Guard
`customer.subscription.trial_will_end`	3-day expiry warning for pre-dunning
`invoice.payment_failed`	Classify failure, trigger recovery sequence
`invoice.payment_succeeded`	Reset failure count, update Revenue Health Score
`customer.updated`	Detect card updates, cancel active dunning
`payment_intent.succeeded`	Confirm Trial Guard pre-auth capture
`payment_intent.payment_failed`	Classify failed pre-auth, trigger SOFT_UPDATABLE sequence
---
4. CORE DATA MODEL
DIE Classification (Failure type taxonomy)
Class	Label	Definition	Recovery approach
HARD_PERMANENT	Hard fail	Do not honor (fraud, stolen card, disputed)	Stop dunning, flag customer
SOFT_UPDATABLE	Soft updatable	Valid card needed (expired, cancelled, wrong details)	Email sequence asking card update
SOFT_TEMPORARY	Soft temporary	Temporary block (NSF, limit, bank hold)	Retry-based sequence with payday logic
Revenue Health Score
Range: 0–100. Computed per connected Stripe account.
Dimension	Weight	Signal
Expiry Risk	30%	% of active subscriptions with cards expiring within 90 days
Failure Rate	25%	% of invoices that failed in the last 30 days
Recovery Rate	20%	% of failed payments recovered in the last 90 days
Customer Risk	15%	% of customers with HARD_PERMANENT failures
Dunning Config	10%	Whether dunning sequences are configured and active
Score interpretation:
80–100: Healthy
60–79: Warning
40–59: At risk
0–39: Critical
Customer Recovery Score
Per-customer score used to decide dunning aggressiveness and Chargeback Shield activation.
Signal	Points
Tenure > 12 months	+30
Zero payment incidents (lifetime)	+25
MRR contribution > $100/mo	+20
Failure is SOFT_UPDATABLE (card update fixable)	+15
No downgrade in last 6 months	+10
Total possible	100
Usage: Score < 40 → activate Chargeback Shield (pre-debit notification email before retry).
---
5. FEATURE SPECIFICATION
F01 — Stripe Connect OAuth
Description: One-click connection to the user's Stripe account via OAuth flow. Stores access token, refresh token, account ID. All subsequent API calls scoped to that account.
Implementation notes:
Store tokens encrypted in MongoDB
Implement token refresh logic
Support multi-account (one REVENANT account → multiple Stripe accounts, future)
MVP: Yes
---
F02 — Revenue Health Card (Audit)
Description: On first connection, REVENANT scans the last 90 days of Stripe data and computes the Revenue Health Score (0–100) across 5 dimensions. Displayed as a score card with breakdown.
Free tier: Yes — this is the PLG acquisition hook. No credit card required.
What's displayed:
Overall score (0–100) with color indicator
Breakdown by dimension (Expiry Risk, Failure Rate, Recovery Rate, Customer Risk, Dunning Config)
MRR at risk ($ amount + %)
Top 3 recommended actions
Implementation notes:
Pull Stripe data: subscriptions, invoices, payment methods, customers
Compute score on first connect (async job, show loading state)
Cache score, refresh nightly via Vercel Cron
Update score in real-time on webhook events
MVP: Yes
---
F03 — Expiry Detection & Pre-Dunning
Description: Daily scan identifies active subscriptions with payment cards expiring within 90 days. Triggers a pre-dunning email sequence to the end customer before the card expires (not after it fails).
Email sequence:
T-90 days: "Your card expires soon — update to avoid interruption"
T-30 days: Reminder
T-7 days: Final reminder
Implementation notes:
Vercel Cron job runs daily at 02:00 UTC
Query all active subscriptions with `card.exp_month` / `card.exp_year` within 90 days
Skip if customer has already updated card
Emails sent via Resend with Stripe customer data merged
MVP: Yes
---
F04 — Failure Classification (DIE Engine)
Description: On every `invoice.payment_failed` webhook, classify the failure as HARD_PERMANENT, SOFT_UPDATABLE, or SOFT_TEMPORARY using Stripe decline codes.
Classification logic:
Stripe decline codes	DIE class
`fraudulent`, `stolen_card`, `pickup_card`, `lost_card`	HARD_PERMANENT
`expired_card`, `invalid_account`, `card_not_supported`, `do_not_honor` (card update resolves it)	SOFT_UPDATABLE
`insufficient_funds`, `card_declined` (temporary), `processing_error`, `try_again_later`	SOFT_TEMPORARY
Implementation notes:
Webhook handler reads `charge.failure_code`
Writes classification to MongoDB
Triggers appropriate recovery sequence
HARD_PERMANENT: no dunning, mark customer in DB, surface in dashboard
MVP: Yes
---
F05 — Smart Dunning Sequences
Description: Automated email sequences sent to the end customer after a payment failure, adapted to the DIE classification.
SOFT_TEMPORARY sequence (retry-based, 5 emails over 21 days):
Day	Email
J+0	Payment failed — we'll retry automatically
J+3	Second retry notice
J+7	Still having trouble — retry in progress
J+14	Action needed — update your card or contact us
J+21	Final notice before suspension
SOFT_UPDATABLE sequence (card update, 4 emails over 14 days):
Day	Email
J+0	Payment failed — please update your card
J+3	Reminder — update your card
J+7	Important: subscription at risk
J+14	Final notice — subscription will be cancelled
Implementation notes:
Vercel Cron runs daily, checks dunning queue
Emails sent via Resend
Sequence cancelled automatically on `customer.updated` (new card detected)
Sequence cancelled automatically on `invoice.payment_succeeded`
All email content uses Stripe customer/invoice data (name, amount, invoice URL)
MVP: Yes
---
F06 — Smart Retry Logic
Description: For SOFT_TEMPORARY failures, REVENANT schedules Stripe charge retries using payday-aware timing instead of fixed intervals.
Payday inference logic:
Analyze customer's historical payment success dates
If pattern detected (e.g., always pays on 1st or 15th): schedule retry for next inferred payday
If no pattern: use country-based benchmark (e.g., France: 27th–2nd; US: 1st/15th)
Fallback: retry at J+3, J+7, J+14 (standard Stripe intervals)
Implementation notes:
Stores inferred payday in customer record
Uses Stripe's `pay` endpoint to trigger invoice payment
Coordinates with dunning sequence timing
MVP: Yes
---
F07 — Chargeback Shield
Description: For customers with Recovery Score < 40, send a pre-debit notification email before retrying their payment. This reduces the surprise factor and lowers chargeback risk.
Email content: "We'll retry your payment of $X on [date]. If you'd like to update your card first, here's the link."
Trigger condition: Customer Recovery Score < 40 AND failure type is SOFT_TEMPORARY or SOFT_UPDATABLE.
Implementation notes:
Sent 24 hours before a scheduled retry
Tracks whether customer updated card in response
MVP: Yes (lightweight — single email before retry)
---
F08 — Revenue Health Dashboard
Description: Main product dashboard. Shows the Revenue Health Score, real-time metrics, active dunning sequences, and customer risk table.
Dashboard sections:
Revenue Health Score (large, prominent)
Key metrics: MRR at risk ($), Active dunning sequences (#), Recovery rate (%), Prevented failures (#)
Customers at risk table: expiring cards, active failures, HARD_PERMANENT flags
Activity feed: recent events (failures, recoveries, pre-dunning sent)
MVP: Yes
---
F09 — Customer Risk Table
Description: Table of all customers with any active risk signal: expiring card, failed payment, active dunning, or HARD_PERMANENT flag.
Columns: Customer name | Status | Failure type | Recovery Score | Dunning step | Action
MVP: Yes
---
F10 — Email Branding
Description: Founders can upload their logo and choose a primary color for all outgoing dunning and pre-dunning emails. Default: REVENANT white-label template.
MVP: No (Phase 2)
---
F11 — Multi-Stripe Account Support
Description: One REVENANT account can manage multiple Stripe accounts. Useful for agencies or founders with multiple products.
MVP: No (Phase 3)
---
F12 — Analytics & Reporting
Description: Monthly revenue protection report: MRR saved, failures prevented, recovery rate vs. previous month.
MVP: No (Phase 2)
---
F13 — Slack / Email Digest Alerts
Description: Weekly digest to the founder summarizing: score change, failures caught, MRR protected, actions needed.
MVP: No (Phase 2)
---
F14 — Cancellation Flow (Churn Deflection)
Description: When a subscription is about to be cancelled (customer-initiated), show an interstitial with a pause or downgrade offer.
MVP: No (Phase 3)
---
F15 — Trial Guard (SmartCharge)
Description: For high-risk trial signups, create a pre-authorization hold on the card before the trial converts to a paid subscription. Validates the card is real, has sufficient funds, and belongs to the customer.
Trigger: `customer.subscription.created` with `status: trialing`
Risk detection (3 signals):
Card funding type = prepaid → high-risk
Card expiry within 30 days of trial end → high-risk
Stripe Radar risk score ≥ threshold → high-risk
Flow:
```
Subscription created (trialing)
    ↓
Risk scan
    ↓
Low-risk → add to standard monitoring queue only
High-risk → create PaymentIntent (capture_method: 'manual')
    ↓
Pre-auth succeeds → hold open (max 7 days)
    ↓
Subscription converts to active → capture PaymentIntent
Subscription cancelled → cancel PaymentIntent
    ↓
Pre-auth fails → classify with DIE engine
              → trigger SOFT_UPDATABLE email sequence
```
Key constraints:
Stripe pre-auth hold expires after 7 days — only applicable to trials ≤ 7 days
3DS/SCA: European cards may require customer authentication — must be handled gracefully (redirect flow or decline)
Do not pre-auth low-risk customers (avoid friction for good customers)
Why better than 1Capture:
1Capture requires a full trial page replacement and applies pre-auth universally
REVENANT applies pre-auth selectively (only high-risk) — less friction for good customers
Integrated with the full recovery stack (dunning, retry logic, DIE classification)
MVP: Yes — included in Phase 1 build
---
6. ONBOARDING DESIGN
Principles
Zero configuration to first value: 3 steps, no form to fill
Progressive disclosure: sensible defaults active immediately, configuration accessible later
One metric to remember: the Revenue Health Score
3-Step Onboarding
Step 1 — Connect
Single CTA: "Connect your Stripe account". Stripe OAuth flow. Redirect back to REVENANT on success.
Step 2 — Score
Loading screen (5–15 seconds): "Analyzing your last 90 days of Stripe data..."
Reveal: Revenue Health Score with breakdown. Show MRR at risk in dollars.
CTA: "Activate Protection" (upgrade) or "Explore your score" (free).
Step 3 — Activate
One-click activation of all default protections:
Expiry pre-dunning: ON
Smart dunning sequences: ON
Smart retry logic: ON
Trial Guard: ON
Chargeback Shield: ON (for Recovery Score < 40)
User sees a confirmation: "REVENANT is now protecting your revenue."
---
7. CONFIGURATION LAYER
What users can configure (Settings page)
All settings have opinionated defaults. Nothing is required to configure.
Setting	Default	Options
Expiry warning lead time	90 days	30 / 60 / 90 days
Trial Guard threshold	Auto (all 3 signals)	Prepaid only / All signals / Off
Dunning sequence — SOFT_TEMPORARY	5 emails / 21 days	On / Off
Dunning sequence — SOFT_UPDATABLE	4 emails / 14 days	On / Off
Chargeback Shield	On (Recovery Score < 40)	On / Off / Threshold adjustment
Smart retry	On (payday-aware)	On / Off
Email sender name	"The [Your Product] Team"	Custom name
Email reply-to	Founder's email	Custom email
What users cannot configure (intentionally)
DIE classification logic (automated, not adjustable)
Revenue Health Score formula (standardized)
Dunning email content per step (Phase 2: custom templates)
Retry intervals for SOFT_TEMPORARY (payday logic is automatic)
---
8. SPRINT PLAN (Phase 1 Build)
Goal: Reach first 10 paying customers.
Sprint 1 — Foundation
Stripe Connect OAuth flow
Webhook ingestion + storage
MongoDB data model (customers, subscriptions, invoices, failures)
Revenue Health Score computation
Dashboard shell (score display + key metrics)
Sprint 2 — Core Protection
DIE classification engine (F04)
Smart dunning sequences (F05) — Resend integration
Expiry detection + pre-dunning (F03)
Vercel Cron jobs for daily scans + dunning queue
Sprint 3 — Recovery & Trial Guard
Smart retry logic (F06) — payday inference
Chargeback Shield (F07)
Trial Guard / SmartCharge (F15) — pre-auth PaymentIntent flow
Customer Risk Table (F09)
Sprint 4 — Polish & Launch Prep
Onboarding flow (3-step)
Settings page (configuration layer)
Email branding defaults
Error handling + edge cases (3DS, expired pre-auth, webhook retries)
Revenue Health Card public page (PLG funnel entry)
---
9. KEY TECHNICAL DECISIONS
Decision	Choice	Rationale
Auth method	Stripe Connect OAuth	Broader permissions, better UX than API key
Background jobs	Vercel Cron	No extra infra, fits Vercel deployment
Email provider	Resend	Developer-friendly, great deliverability
Pre-auth method	`PaymentIntent` with `capture_method: manual`	Industry standard, compatible with 3DS
Trial Guard scope	High-risk only	Less friction for good customers vs. universal pre-auth
Dunning content	REVENANT-managed templates	Faster MVP, custom templates in Phase 2
Score refresh	Real-time on webhooks + nightly Cron	Balance of accuracy and API rate limits
---
10. ENVIRONMENT VARIABLES
```env
STRIPE_CLIENT_ID=           # Stripe Connect app client ID
STRIPE_SECRET_KEY=          # REVENANT platform Stripe key
NEXTAUTH_SECRET=
NEXTAUTH_URL=
MONGODB_URI=
RESEND_API_KEY=
RESEND_FROM_EMAIL=
CRON_SECRET=                # Vercel Cron authentication
```
---
11. EDGE CASES TO HANDLE
Scenario	Handling
Trial Guard pre-auth expires (>7 days)	Monitor via Cron, extend if subscription still active
3DS required for European card pre-auth	Return redirect URL to customer, handle async confirmation
Customer updates card mid-dunning	Webhook `customer.updated` cancels sequence, triggers retry
HARD_PERMANENT failure	No dunning, flag in dashboard, do not retry
Multiple failures on same customer	Stack tracking, do not send duplicate emails
Stripe webhook delivered out of order	Idempotency keys on all write operations
Stripe Connect token expired	Refresh token flow, alert user if refresh fails

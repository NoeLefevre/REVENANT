REVENANT — Priority Roadmap
Version: 1.0 — March 2026
---
READING THIS ROADMAP
Features are ordered by build priority. Each phase has a clear business objective. No time horizons — phases are sequenced by readiness and dependencies, not calendar dates.
Phase 1 objective: Reach 10 paying customers. Everything in Phase 1 is required to close the first sale and deliver clear value. Nothing more, nothing less.
Phase 2 objective: Retain those customers and improve conversion. Features that reduce churn, increase stickiness, and make the product easier to sell.
Phase 3 objective: Expand to larger customers and new segments. Features that unlock higher ACV, multi-account use cases, and team workflows.
---
PHASE 1 — FIRST 10 PAYING CUSTOMERS
> Build the minimum product that is genuinely better than doing nothing — and genuinely better than 1Capture for the specific problem of trial fraud + payment recovery.
P1-01 — Stripe Connect OAuth
Why first: Everything else depends on it. No connection = no product.
Core implementation: OAuth flow, token storage (encrypted), webhook registration, basic account model in MongoDB.
---
P1-02 — Webhook Ingestion + Event Storage
Why: Real-time event processing is the backbone of all active features.
Implement handlers for all 7 core events. Idempotency keys on all write operations. Dead-letter queue for failed webhooks.
---
P1-03 — Revenue Health Score
Why: This is the PLG acquisition hook. It's also what justifies the purchase — users need to see their risk before they'll pay.
Compute all 5 dimensions. Store and cache. Refresh on webhook events + nightly Cron.
---
P1-04 — Revenue Health Dashboard
Why: Without a dashboard, users have no way to monitor their protection or trust that REVENANT is working.
Score display, 4 metric cards, customer risk table (basic), activity feed.
---
P1-05 — DIE Classification Engine
Why: All recovery features depend on correctly classifying the failure type. Wrong classification = wrong email sequence = more churn.
Map Stripe decline codes → HARD_PERMANENT / SOFT_UPDATABLE / SOFT_TEMPORARY. Store per failure in MongoDB.
---
P1-06 — Smart Dunning Sequences
Why: This is the core recovery feature. Without it, REVENANT is just a dashboard.
SOFT_TEMPORARY: 5 emails over 21 days.
SOFT_UPDATABLE: 4 emails over 14 days.
Auto-cancel on card update or payment success.
Resend integration. REVENANT-managed email templates (no custom branding yet).
---
P1-07 — Expiry Detection & Pre-Dunning
Why: This is REVENANT's main differentiator — acting before failure. It's the feature that no standard Stripe setup provides.
Daily Cron scan. 3-email sequence at T-90, T-30, T-7. Skip if card already updated.
---
P1-08 — Trial Guard (SmartCharge)
Why: Free trial abuse is the #1 pain point for the target persona (validated via Robin Faraj). This is what makes REVENANT better than 1Capture — selective pre-auth for high-risk signups only, integrated with the full recovery stack.
Risk detection: prepaid card, expiry within 30 days of trial end, Radar score. PaymentIntent with `capture_method: manual`. 7-day hold constraint. 3DS/SCA handling.
---
P1-09 — Smart Retry Logic
Why: Retrying at the wrong time wastes recovery attempts. Payday-aware retries directly improve recovery rate — which is the primary metric customers care about.
Payday inference from payment history. Country benchmark fallback. Coordinates with dunning sequence timing.
---
P1-10 — Chargeback Shield
Why: Lightweight addition (one email before retry) that reduces chargebacks for high-risk customers. Directly reduces the founder's biggest operational headache.
Trigger: Recovery Score < 40. Pre-debit notification 24h before scheduled retry.
---
P1-11 — 3-Step Onboarding Flow
Why: Without a smooth onboarding, activation rate will be too low to reach 10 paying customers.
Connect → Score (loading + reveal) → Activate (one-click). No configuration required to activate.
---
P1-12 — Settings Page (Configuration Layer)
Why: Not every founder wants the same defaults. The settings page is what allows them to trust the product without feeling locked in.
8 configurable settings with sensible defaults. All optional. No setting is required to activate protection.
---
P1-13 — Onboarding Email Sequence
Why: Many users will see their score but not convert immediately. The email sequence converts them over 7 days without manual follow-up.
4 emails: score reveal, card expiry alert, recovery rate benchmark, score expiry nudge. Sent via Resend. Only to non-converters.
---
PHASE 2 — RETENTION & CONVERSION
> Features that make paying customers stay longer and make the product easier to sell to new ones.
P2-01 — Email Branding (Custom Logo + Color)
Founders want their dunning emails to match their product brand. Currently blocked by MVP scope. High-trust, low-effort feature for customers.
---
P2-02 — Monthly Revenue Protection Report
Automated monthly email to the founder: MRR saved, failures prevented, recovery rate vs. previous month. Makes the value of REVENANT quantifiable and shareable. Reduces churn by making ROI visible.
---
P2-03 — Slack / Email Digest Alerts
Weekly digest: score change, failures caught, MRR protected, actions needed. Keeps REVENANT top-of-mind even if the founder doesn't log in.
---
P2-04 — Custom Dunning Email Templates
Allow founders to edit the subject line and body of each dunning email. Required for customers who have a specific brand voice or want to add personalized offers.
---
P2-05 — A/B Testing for Dunning Emails
Test two dunning sequences against each other to optimize recovery rate. Requires at least 50 failures/month to be statistically meaningful — relevant only for growing customers.
---
P2-06 — Customer Recovery Score — Manual Override
Let founders manually set the Recovery Score for a specific customer (e.g., "this is a VIP, never send aggressive dunning"). Keeps the product flexible for edge cases.
---
P2-07 — Revenue Health Card — Public Shareable Page
Let founders share their Revenue Health Score publicly as a trust signal with investors or co-founders. Also a virality mechanic ("powered by REVENANT" link).
---
PHASE 3 — EXPANSION
> Features that unlock larger customers, higher ACV, and new use cases.
P3-01 — Multi-Stripe Account Support
One REVENANT account managing multiple Stripe accounts. Targeted at: agencies, studios, founders with multiple products. Unlocks a new ICP segment.
---
P3-02 — Cancellation Flow / Churn Deflection
Intercept customer-initiated cancellations with a pause or downgrade offer. Complementary to payment failure recovery — reduces churn from voluntary cancellations, not just involuntary ones.
---
P3-03 — Team Access (Multiple Users per Account)
Allow multiple team members to access the same REVENANT account. Required for companies with a Customer Success team or Finance team managing Stripe. Unlocks B2B sales to companies with >5 employees.
---
P3-04 — API + Webhooks (Developer Access)
Expose REVENANT data and events via API. Allows developers to integrate REVENANT scores into their own dashboards or trigger custom actions on payment events.
---
P3-05 — White-Label Mode
Full white-label: remove all REVENANT branding, custom domain for hosted pages. Targeted at agencies managing Stripe accounts for clients.
---
FEATURES NOT BUILDING (Scope exclusions)
Feature	Reason
Dunning via SMS	Compliance complexity, low additional recovery rate vs. email
AI-generated dunning copy	Unpredictable tone, risk of brand damage, low ROI
Stripe Billing replacement	Out of scope — REVENANT works with Stripe, not against it
Automated refunds	Too much risk of abuse, too complex to scope correctly
Revenue forecasting	Analytics product, different ICP, different pricing
---
SUCCESS METRICS BY PHASE
Phase 1
10 paying customers
Revenue Health Score computed for 100% of connected accounts
Trial Guard pre-auth activated on ≥ 1 real trial signup
Dunning sequence sent for ≥ 1 real payment failure
Phase 2
Monthly churn rate < 5%
Recovery rate improvement: ≥ +15% vs. pre-REVENANT baseline (self-reported)
NPS ≥ 40 (founder segment)
Average time-to-activation < 5 minutes (Step 1 → Step 3 complete)
Phase 3
ACV > $500/yr (multi-account customers)
Expansion MRR from existing customers ≥ 20% of new MRR
First agency or multi-product customer on multi-account plan
REVENANT — Onboarding Flow
Version: 1.0 — March 2026
---
DESIGN PRINCIPLES
Zero-config to first value — The user must see meaningful output before being asked to configure anything.
3 steps maximum — Connect → Score → Activate. No exceptions.
No decisions on entry — Defaults are pre-selected. The user activates everything with one click.
One number to remember — The Revenue Health Score (0–100) is the anchor of the entire experience.
Progressive disclosure — Advanced configuration is accessible from settings, never surfaced during onboarding.
---
FUNNEL ENTRY POINTS
Entry A — Landing page CTA
User clicks "Get your free Revenue Health Score" on revenant.so.
→ Goes directly to Step 1 (Connect).
Entry B — Direct sign-up
User creates an account with email. After email confirmation:
→ Redirected to Step 1 (Connect).
Entry C — Referral / word-of-mouth
User arrives with a referral link from another founder.
→ Same as Entry A.
In all cases: No pricing page shown during onboarding. The score comes first.
---
STEP 1 — CONNECT
Screen: "Connect your Stripe account"
URL: `/onboarding/connect`
Layout:
REVENANT logo, centered
Headline: "See exactly how much revenue you're losing to failed payments."
Subheadline: "Connect your Stripe account. We'll scan the last 90 days and show you your Revenue Health Score — free, in 30 seconds."
Single CTA button: "Connect Stripe" → triggers Stripe Connect OAuth
Trust signals (below button):
"Read-only access. We never touch your data without your permission."
"OAuth secured — no API keys, no copy-paste."
"Used by [N] founders protecting $X MRR" (once we have real numbers)
What happens technically:
User clicks "Connect Stripe"
Redirected to Stripe OAuth authorization page
User authorizes REVENANT access
Stripe redirects back to `/api/auth/stripe/callback`
REVENANT stores access token + account ID in MongoDB
User redirected to Step 2
Error states:
OAuth denied: "Looks like you cancelled. Want to try again?" + retry CTA
OAuth error: "Something went wrong with Stripe. Please try again." + support link
---
STEP 2 — SCORE
Screen A: "Analyzing your data..."
URL: `/onboarding/score` (loading state)
Layout:
Progress animation (pulsing score dial from 0 to ?)
Copy: "Analyzing your last 90 days of Stripe data..."
Sub-items animating in:
✓ Scanning 847 invoices...
✓ Checking card expiry dates...
✓ Analyzing payment failure patterns...
✓ Computing your Revenue Health Score...
Duration: 5–15 seconds (real async job)
What happens technically:
Background job triggered on OAuth callback completion
Pulls from Stripe: subscriptions, invoices, payment_methods, customers (last 90 days)
Computes Revenue Health Score (5 dimensions)
Classifies existing failures with DIE engine
Identifies cards expiring within 90 days
Stores all results in MongoDB
Frontend polls `/api/score/status` every 2 seconds until ready
---
Screen B: "Your Revenue Health Score"
URL: `/onboarding/score` (result state)
Layout:
Large score display, centered: e.g., 62 / 100 — color coded (red/orange/green)
Score label: e.g., "⚠️ At Risk"
Metric cards (4 cards in a row):
$X,XXX at risk — MRR exposed to expiring cards or active failures
X% failure rate — invoice failures in last 30 days
X% recovery rate — failures recovered in last 90 days
X cards expiring — cards expiring within 90 days
Breakdown section (collapsible): score by dimension with bar chart
CTA section:
If score < 70 (most users):
> "Your revenue is at risk. REVENANT can protect it — automatically."
> **[Activate Protection — $X/mo]** (primary, large)
> [Explore your score →] (secondary, small)
If score ≥ 70:
> "Your revenue is in good shape — let's keep it that way."
> **[Activate Protection — $X/mo]** (primary)
> [Explore your score →] (secondary)
Psychological moment: This is where the sale happens. The score makes the risk concrete and personal. The CTA should feel like relief, not a pitch.
---
STEP 3 — ACTIVATE
Screen: "Activate your protection"
URL: `/onboarding/activate`
Reached via: Clicking "Activate Protection" in Step 2.
Layout:
Headline: "One click. Everything protected."
Subheadline: "REVENANT activates all protections with sensible defaults. You can customize everything later."
Protection list (all pre-checked, visual checkboxes):
Protection	Status	What it does
✅ Expiry Pre-Dunning	Active	Warns customers 90 days before their card expires
✅ Smart Dunning — Temporary Failures	Active	5-email sequence over 21 days for NSF/bank-hold failures
✅ Smart Dunning — Card Update Failures	Active	4-email sequence over 14 days for expired/cancelled cards
✅ Smart Retry	Active	Retries charges on inferred payday, not random intervals
✅ Trial Guard	Active	Pre-authorizes high-risk trial signups to block bad cards
✅ Chargeback Shield	Active	Pre-debit notification for high-risk customers before retry
Pricing display:
Show the applicable tier based on their MRR (pulled from Stripe OAuth)
Example: "$49/mo — protecting $18,400 MRR"
"Cancel anytime. No contract."
CTA: "Activate REVENANT →" → triggers Stripe Checkout (subscription payment)
Below CTA:
"Already protecting founders with $X+ in MRR" (social proof)
"30-day money-back guarantee"
After payment success:
→ Redirect to Dashboard (Step 4 — not part of onboarding steps, but next screen)
---
POST-ACTIVATION: DASHBOARD
Screen: "REVENANT is protecting your revenue"
URL: `/dashboard`
First-time state (immediately after activation):
Banner at top: "🛡️ REVENANT is now active. We'll notify you if anything needs your attention."
Revenue Health Score (now with "Protected" badge)
4 metric cards
Customer Risk Table (pre-populated with data from Step 2)
Activity feed (showing "Protection activated" as first entry)
Empty state for activity feed:
"No payment failures in the last 7 days. Your revenue is protected."
What the user should NOT see on first load:
Empty tables with no explanation
Configuration forms or setup checklists
Requests to set up email templates or connect more services
---
EMAIL SEQUENCE — ONBOARDING
Email 1: Sent immediately after Stripe Connect (Step 1 complete)
Subject: "Your Revenue Health Score is ready"
Send time: Triggered on score computation complete (async)
Content:
Score reveal: "Your Revenue Health Score: 62/100"
2-sentence explanation of what's at risk
CTA: "Activate protection →"
---
Email 2: Sent 24h after Step 2 if user did NOT activate
Subject: "You have X cards expiring in the next 30 days"
Send time: T+24h post score, non-converters only
Content:
Personalized: "We found 4 cards expiring before [date]"
Urgency: "That's $XXX/mo at risk of failing without warning"
CTA: "Activate protection — $X/mo"
---
Email 3: Sent 72h after Step 2 if user did NOT activate
Subject: "Robin, your recovery rate is below average"
Send time: T+72h post score, non-converters only
Content:
Benchmark: "SaaS products at your MRR typically recover 68% of failures. You're recovering X%."
CTA: "Start recovering more — activate REVENANT"
---
Email 4: Sent 7 days after Step 2 if user did NOT activate
Subject: "Your free score expires soon"
Send time: T+7d post score, non-converters only
Content:
"Your Revenue Health Score data is 7 days old. Things may have changed."
"Reconnect and see if your score has improved — or gotten worse."
CTA: "Check your score again →"
---
ONBOARDING STATES TO HANDLE
State	User action	System response
Connected Stripe, left before score loaded	Returns to app	Resume from Step 2 loading
Score computed, left before activating	Returns to app	Show Step 2 score result with CTA
Activated, then cancels Stripe Checkout	Returns to app	Show Step 3 again, payment pending
Activated successfully	Returns to dashboard	Show active dashboard (no re-onboarding)
Stripe OAuth revoked (user disconnects from Stripe side)	Webhook received	Email: "Your Stripe connection was removed. Reconnect to continue protection."
---
UX ANTI-PATTERNS TO AVOID
❌ Don't ask for any information before showing the score (name, company, use case)
❌ Don't show pricing before the score is revealed
❌ Don't make the user configure anything to see value
❌ Don't use a multi-step progress bar that shows 10 steps
❌ Don't show an empty dashboard as the first screen
❌ Don't ask the user to "set up email templates" during onboarding
❌ Don't gate the score behind email verification
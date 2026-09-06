# TasksAI — Billing, packaging & public launch (M14)

## The commercial gate (hard, code-enforced)

Payment acceptance and paid-plan activation are **refused** until the
operating entity and a commercial license are in place
(`compliance/decisions.md`, still open). The signal is
`TASKSAI_COMMERCIAL_LICENSE_SIGNED=true`.

- `lib/billing/gate.ts` — `isBillingOpen()`, `assertBillingOpen()` (throws
  `LicenseGateError`), `stripeConfigured()` (gate **and** a Stripe key).
- While billing is closed: `startCheckout` throws; `assertFeature` /
  `assertAllowance` / `recordUsage` are **no-ops** — the product runs
  unrestricted, exactly as it does today. Every prior milestone's tests
  still pass unchanged.
- Stripe is **test mode only** in M14 per the run decision — no live keys.

## Packaging (`lib/billing/plans.ts`, prices = M00 hypotheses, EUR)

| Tier | €/seat/mo | AI | Automations | Integrations | Analytics | API tokens | AI proposals/mo | Automation runs/mo |
|---|---|---|---|---|---|---|---|---|
| Free | 0 | — | — | — | — | — | 0 | 0 |
| Pro | 8 | ✓ | — | — | — | ✓ | 200 | 0 |
| Business | 14 | ✓ | ✓ | ✓ | ✓ | ✓ | 1000 | 5000 |
| Enterprise | custom | ✓ | ✓ | ✓ | ✓ | ✓ | ∞ | ∞ (SSO/SCIM in M15) |

## Entitlements & metered allowances

- `assertFeature(ctx, feature)` — gates `ai` / `automations` / `integrations`
  / `analytics` / `apiTokens` by effective tier. A `canceled`/`past_due`
  subscription past its grace window falls back to **free**.
- `assertAllowance(ctx, meter, n)` — upserts the period `UsageMeter` and
  **blocks overage** (`429 rate_limited`) rather than silently charging.
  Top-up units add on top of the included allowance.
- `recordUsage` increments the meter after a successful action. Wired into
  `runAiJob` (`ai_proposals`); automation runs get the same treatment when
  billing opens.

## Usage transparency (`GET /workspaces/{slug}/billing/usage`)

Returns the effective tier + status, each meter's `used / included / topUp
/ remaining / overage / pressure`, the **cost driver** (meter closest to
its limit), and the estimated monthly bill (`estimateMonthlyCents`,
per-seat × billable seats, capped at `maxSeats`). *"Allowances are enforced,
not billed as surprise overage."*

## Subscription lifecycle

- `POST /billing/checkout` `{ tier, seats }` (owner) → Stripe Checkout
  (14-day trial) or a stub session when Stripe is unconfigured.
- `POST /api/billing/stripe` — webhook (no session, **404 until billing is
  open + `STRIPE_WEBHOOK_SECRET` set**). Signature verified via
  `verifyStripeSignature` (HMAC `t.body`, 300 s window, constant-time).
  **Idempotent** on the Stripe event id (`BillingEvent`). Handles
  `customer.subscription.{created,updated}` → `Subscription`, `invoice.paid`
  → `Invoice`.
- `POST /billing/cancel` (owner) → `status: canceled` with a **grace
  window** to `currentPeriodEnd`; cancels at period end in Stripe.
- `GET /billing/invoices` (owner).

## Launch checklist (tracked, not all in this PR)

- [ ] Commercial license + operating entity signed → set `TASKSAI_COMMERCIAL_LICENSE_SIGNED=true`
- [ ] Terms, privacy notice, DPA, refund/cancellation, tax/VAT, support, status policies published
- [ ] Stripe test-mode → live-mode key swap, tax settings, EU VAT
- [ ] Launch site + onboarding + lifecycle email + docs + support workflow + referral loop (`Referral` model exists)
- [ ] Staged rollout with feature flags, capacity tests, rollback criteria, daily launch scorecard
- [ ] Showcase entry `beta → live` once the scorecard passes

## New env (all optional)

| Var | Effect |
|---|---|
| `TASKSAI_COMMERCIAL_LICENSE_SIGNED` | `true` opens billing (gates, checkout, meters) |
| `STRIPE_SECRET_KEY` | test-mode key; without it checkout returns a stub |
| `STRIPE_WEBHOOK_SECRET` | required for the webhook route to exist |

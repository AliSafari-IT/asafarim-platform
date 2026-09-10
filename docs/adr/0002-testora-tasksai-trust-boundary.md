# ADR 0002: Testora ↔ TasksAI cross-app trust boundary

**Status:** Accepted
**Date:** 2026-09-10
**Related:** [Issue #269](https://github.com/AliSafari-IT/asafarim-platform/issues/269) (epic), [Issue #268](https://github.com/AliSafari-IT/asafarim-platform/issues/268)

## Context

The autonomous quality loop wires two apps together bidirectionally:

- **Testora → TasksAI** — a regression or a newly-flaky scenario hands its
  artifact bundle to TasksAI, which diagnoses it and drops an audited draft
  proposal on the board.
- **TasksAI → Testora** — a decomposed feature provisions **pending**
  Testora scenarios from its acceptance criteria and attaches a required
  check to the task; the task cannot be completed until Testora reports the
  scenarios green.

Testora and TasksAI are **separate apps with separate isolated databases**
([tasks-ai ADR-0001](../../apps/tasks-ai/docs/adr/0001-dedicated-database.md),
Testora's own Postgres/Drizzle service), separate auth, and — in production
— a strict CSP that rules out cross-origin iframes. Before any event flows,
the boundary and the data crossing it must be fixed.

## Decision

### Authentication — machine identity only, no user session

- **No user session ever crosses the boundary.** Neither app accepts the
  other's cookies or JWTs.
- **Machine-to-machine reads** (TasksAI fetching a Testora artifact bundle)
  use a **service token** — a bearer credential provisioned per direction,
  scoped to the bundle-read endpoint, rotatable, never logged.
- **Every webhook, both directions**, is signed with **HMAC-SHA256** over
  `${timestamp}.${deliveryId}.${rawBody}` and carries three headers:
  `x-asafarim-signature`, `x-asafarim-delivery`, `x-asafarim-timestamp`.
  Receivers **reject** a delivery whose timestamp is outside a ±300s window
  (replay defence) and verify the signature in constant time.
- **Secret rotation:** verification accepts an array of currently-valid
  secrets so a new secret can be introduced, propagated, and the old one
  retired without downtime.

The signing + verification helpers live in
[`@asafarim/testora-tasksai-contract`](../../packages/testora-tasksai-contract)
(`signPayload` / `verifySignature`) so both stacks share one implementation.

### Versioned contracts

The bundle schema (#258), the provision request/response (#262/#266), the
webhook event payloads (#261), the green-light callback (#263) and the
diagnosis proposal (#264) are all published as zod schemas in the shared
package **before** their consuming issue is implemented. Each payload carries
a numeric `v` discriminant. Additive changes (new optional field, new enum
member consumed defensively) are free; breaking changes bump `v` and
`CONTRACT_VERSION` and keep the previous branch until both apps migrate.

### Data minimisation

- **Testora → TasksAI:** test artifacts only — DOM snapshot, screenshot,
  video, step timeline, error. **Never** application source code; the bundle
  schema is `.strict()` so an unknown key (e.g. a stray `sourceCode` field)
  fails validation.
- **TasksAI → Testora:** feature title + acceptance-criteria text + opaque
  task/check/criterion refs. **No** task PII, **no** workspace-member data,
  **no** comments.

### Failure modes (explicit)

- **Testora unreachable** → provisioned `TaskCheck`s stay `pending`; tasks
  are simply not auto-completable; nothing breaks and nothing is lost.
- **TasksAI AI off / degraded** → a regression still creates a
  **deterministic templated task** (mirrors Testora's existing
  `buildIssueDraft` fallback and [tasks-ai ADR-0004](../../apps/tasks-ai/docs/adr/0004-ai-proposal-model.md));
  no proposal, no crash.
- **Webhook storm / loop** → per-source rate limits, and a `causationId`
  carried from a triggering event onto anything provisioned as a result, so
  the automations engine's existing loop guard applies.

### Scope guard — permanently out of scope for this loop

- It never auto-merges a branch.
- It never auto-closes or auto-completes a task without a human (the check
  gate blocks completion; a human still drives it, and an admin override is
  audited).
- Testora never writes to a repository.

## Consequences

- **Positive:** one signing implementation, one schema source of truth,
  reviewed before code depends on it. Every crossing is authenticated,
  replay-resistant, and minimised. Degradation paths are defined, not
  discovered in an incident.
- **Negative:** a breaking schema change is a two-app, two-PR dance (add the
  new `v` branch, migrate each consumer, retire the old branch). Accepted —
  it is the price of not coupling the two databases.

## Alternatives considered

- **Shared database / foreign keys between the apps** — rejected: destroys
  the isolation both apps were built for, couples migrations, and widens the
  blast radius of either app's compromise.
- **Cross-origin iframe trace viewer in the task card** — rejected: the
  production CSP forbids it. The evidence is rendered by a shared
  `@asafarim/ui` component (#267) from the bundle JSON instead.
- **Unsigned webhooks on a shared secret path** — rejected: no replay
  defence, no per-delivery identity, no clean rotation story.

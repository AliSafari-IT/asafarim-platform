# TasksAI — Rules, automations & integration platform (M09)

## Rules engine (`lib/automations/`)

**Trigger → conditions → actions.** Trigger is `{ event, filters[] }`;
conditions are ANDed `{ field, op, value }` clauses (`eq`, `neq`,
`contains`, `gt`, `lt`, `is_set`, `is_unset`, `changed_to`,
`changed_from`); actions are one of `set_status`, `assign`, `add_label`,
`comment`, `set_due_in_days`, `webhook`.

- **Dry run** — `POST .../automations/rules/{id}/dry-run` with a sample
  event returns `{ triggered, conditionsMet, wouldRun, plannedActions,
  loopRisk }` and **executes nothing**.
- **Lifecycle** — rules start `draft`; `PATCH .../rules/{id}` sets
  `active`/`paused`/`draft`. Execution runs off the outbox drainer for
  every `activity.fanout` event.
- **Execution log** — `AutomationRun` per firing with a per-action outcome
  `log`, `skipped`/`succeeded`/`failed` state, and `causationId`.
- **Retries / failure queue** — actions that throw are logged with the
  error and the run is `failed`; the outbox row that drove it retries with
  backoff and dead-letters after 6.
- **Rate limit** — `maxRunsPerHour` per rule; over the cap → the run is
  recorded `rate_limited`, not executed (integration-tested).
- **Loop guard** — every run carries a `causationId` chain; a chain deeper
  than **3** is skipped (`skipped: "loop-guard"`). An action whose emitted
  event equals the rule's trigger is flagged `loopRisk` in the dry run.
- **Rollback guidance** — the run log lists exactly which fields each
  action changed on which task, so an operator can reverse them by hand;
  automated rollback is a follow-up.

## Scoped API tokens (`lib/tokens/`)

`POST .../api-tokens` mints `tai_<random>`; **only the sha256 hash is
stored**, plaintext returned once. Scopes:
`tasks:read/write`, `projects:read/write`, `comments:read/write`,
`webhooks:manage`. `resolveToken()` returns `null` immediately for a
revoked or expired token — **revoked credentials stop access at once**
(integration-tested). Rotate mints a linked replacement and revokes the old.

## Webhooks (`lib/webhooks/`)

`POST .../webhooks` registers an **https** endpoint and returns the signing
secret once. Deliveries are **signed**: `x-tasksai-signature =
HMAC-SHA256(secret, "<timestamp>.<body>")`, plus `x-tasksai-timestamp` and
`x-tasksai-delivery`. `verifySignature()` enforces a 300s replay window and
compares in constant time. `@@unique([endpointId, dedupeKey])` makes a
re-delivered logical event a no-op — an automation retry cannot double-fire
a webhook. The worker delivers with exponential backoff, `dead` after 8.

## GitHub integration (`lib/integrations/github.ts`)

Chosen per the M00 decision. **Read-first**: `POST /api/integrations/github`
(machine route, per-repo HMAC verified in-handler, `x-hub-signature-256`) —
an `issues` event creates a task the first time and updates title / closed
state after; deliveries dedupe on `github:<repo>#<number>`, so replays are
no-ops. **No write-back to GitHub in M09** — sync ownership is "GitHub is
the source"; an outbound path would be documented before it ships.

## Metering & tenant safety

Every rule query, webhook delivery, and integration event is scoped by
`workspaceId`. Automation actions run only against the event's own
workspace. AI-invoking actions are out of scope for M09 (they would still
produce M06 proposals, never auto-apply). The MCP surface is deferred until
the public API has soaked — read-only first, per the milestone.

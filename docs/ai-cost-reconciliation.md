# AI cost reconciliation

**Issue:** [#592](https://github.com/AliSafari-IT/asafarim-platform/issues/592) · **Milestone:** [#31](https://github.com/AliSafari-IT/asafarim-platform/milestone/31) · **Contract:** [ADR 0003](adr/0003-ai-cost-event-contract.md)

The per-response cost events that ResuMatch, Vionto and TasksAI write are
fast and attributable, but they are **not** the financial system of record.
Providers bill late adjustments, cached/reasoning/tool units and costs that
belong to no single request. Reconciliation compares the provider's daily
figure with the sum of our events and **reports** the difference. It never
changes an event, a price snapshot or a user-facing timeline.

```
OpenAI  /v1/organization/costs ──┐                         ┌─► AiCostReconciliationLine (append-only)
Anthropic /v1/organizations/cost_report ─┤  admin job      │
fal / Kling / ElevenLabs (no API) ───────┤  reconcile() ───┼─► AiCostReconciliationRun (sources, freshness, summary)
Vionto events (platform DB) ─────────────┤                 │
ResuMatch /api/internal/ai-cost-daily ───┤                 └─► log line + Discord alert (numbers only)
TasksAI   /api/internal/ai-cost-daily ───┘
```

## What is compared

- **Provider side:** daily cost per provider account, UTC day and model
  (plus non-model lines such as web search, shown as `unmodeled`).
- **Internal side:** each app's `ai_cost_event` rows with
  `credentialSource = "platform"` and `fixture = false`, summed per
  provider/day/model. Effective cost follows ADR 0003 (`actual ?? estimated`,
  adjustment deltas included). Unpriced (`unknown`) events are **counted, not
  summed as $0**. BYOK spend is excluded — it is billed to the user's own
  provider account.
- Model names are matched after lowercasing and dropping snapshot dates
  (`gpt-4o-mini-2024-07-18` → `gpt-4o-mini`). The day-level roll-up does not
  depend on model matching.

## Statuses

| Status | Meaning |
|---|---|
| `matched` | \|internal − provider\| ≤ max(threshold × provider, $0.05) |
| `under_recorded` | provider billed more; the gap is **unattributed** |
| `over_recorded` | we recorded more (usually a price-table estimate running high) |
| `provider_only` / `internal_only` | only one side has spend |
| `pending` | day is within 48 h of its end — shown, not judged |
| `empty` | no spend on either side |
| `no_provider_api` | no admin key configured, or the provider has no cost API — **never a green result** |
| `provider_unavailable` / `internal_unavailable` | a fetch failed; drift is not judged for that run |

The threshold is the `ai.costReconciliation.driftBps` setting (default
500 bps = 5 %). Only `matched`/drift statuses on settled days feed the
headline numbers on the page.

## Unattributed remainder

`unattributedMicros = max(provider − internal, 0)` lives on the
provider/day(/model) line and nowhere else. It is **never** spread across
users, workspaces, projects, tasks or videos, and it is **never** written back
as an adjustment on a cost event: a provider's daily aggregate cannot be
safely tied to one request. If a provider ever returns a per-request billed
amount, that belongs in the app at call time as `costSource:
"provider_reported"`, not in reconciliation.

## Idempotency, late data and reruns

- A run covers a trailing window (default 7 days, max 31). Rerunning any
  window is safe.
- Each report line is fingerprinted (status, finality, amounts, counts). A
  run inserts a line only when its fingerprint differs from the latest
  observation of the same (provider, account, day, model). Unchanged data →
  nothing written. Late-arriving provider data → a new observation; the old
  one stays as history (the page shows `rev N`).
- `(runId, provider, account, day, model)` is unique, so a retried insert
  within one run is a no-op.
- Only one run at a time; a run stuck in `running` for 15 minutes stops
  blocking new ones.
- Pagination refuses a repeated cursor and caps page count; duplicate lines
  across pages are collapsed before summing.

## Running it

- **Scheduled:** `POST /api/internal/ai-cost-reconciliation?days=7` with
  `Authorization: Bearer $INTERNAL_API_SECRET`. Returns `202` immediately and
  runs after the response; `409` if a run is in progress. Hourly is plenty —
  provider data lands within minutes but settles over a day or two.
- **Manual:** Admin Console → **AI Costs** → *Reconcile last N days*
  (requires `ai_costs.reconcile`).
- The page never calls a provider; it only reads stored runs and lines, so a
  slow or down provider never blocks a page load, and user timelines keep
  reading their own events.

## Least privilege

| Credential / permission | Where | Scope |
|---|---|---|
| `ai.openai.adminKey` / `OPENAI_ADMIN_KEY` | settings store (AES-256-GCM) or env, admin app only | OpenAI org admin key; used only for `GET /v1/organization/costs`. Use a read-only admin key where the org allows it. |
| `ai.anthropic.adminKey` / `ANTHROPIC_ADMIN_KEY` | same | Anthropic Admin API key; used only for `GET /v1/organizations/cost_report`. |
| `INTERNAL_API_SECRET` | every app | existing bearer for machine routes; the new `ai-cost-daily` routes return sums only |
| `ai_costs.view` | RBAC | Admin + Super Admin by default |
| `ai_costs.reconcile` | RBAC | Super Admin by default; grant deliberately (it spends provider admin-API quota with the platform's admin keys) |

Admin keys are distinct from the inference keys (`ai.openai.apiKey`, …) and
are read only inside `apps/admin/lib/server/ai-cost-reconciliation/adapters.ts`
for the outgoing request header. They are never logged, never stored in a
run's `sources`, and never part of an error string — failures are persisted
as `HTTP <status>`, `timed out`, `unexpected response shape` or
`pagination loop`.

## Privacy

Reconciliation tables, logs and alerts hold provider names, account keys,
UTC days, model names, amounts (integer micros), counts and app slugs —
**no** user/workspace/project/task ids, prompts, responses or secrets. The
apps' `ai-cost-daily` routes return the same aggregates.

## Audit

- Manual runs write `ai_costs.reconciliation.requested` to the platform
  audit log (actor, window).
- Every run — manual or scheduled — is itself a durable
  `AiCostReconciliationRun` row (trigger, actor id for manual runs, window,
  per-source status and freshness, summary).
- Each run emits one structured log line
  (`{"event":"ai_cost_reconciliation", …}`) with counts and totals, and a
  Discord alert (the existing `WEBHOOK_SECRET_DISCORD` channel) when a
  settled day newly enters a drift status or a source is unavailable. A
  rerun that sees the same drift does not alert again.

## Retention

| Data | Retention |
|---|---|
| `AiCostReconciliationRun` | 400 days (13 months — one full year-over-year comparison). Deleting a run cascades to the lines it inserted. |
| `AiCostReconciliationLine` | follows its run. The latest observation for each day is the report; older observations are history. |
| App cost events | unchanged — ADR 0003 §10. Reconciliation never deletes or edits them. |

Pruning is an operator task until a sweep is scheduled:
`DELETE FROM "AiCostReconciliationRun" WHERE "startedAt" < now() - interval '400 days';`

## Adding a provider

Implement `ProviderCostAdapter` (see `adapters.ts`): fetch pages, parse them
into `ProviderCostLine`s (pure parsers live in
`packages/ai-cost-ledger/src/provider-reports.ts` with fixture tests), and
return `unsupported` when unconfigured. The job, storage and page need no
change. fal.ai, Kling and ElevenLabs are registered as `unsupported` today
because none of them exposes a billed-cost report API.

## Known limits

- One platform account per provider: internal events record
  `credentialSource: "platform"`, not which org key, so they cannot be split
  across several provider accounts.
- The provider figure covers **all** usage on that org, including apps that
  do not write cost events yet (e.g. AppBuilder, EduMatch). Their spend shows
  up as unattributed. That is correct, and the remainder shrinks as those
  apps adopt the contract.
- Anthropic Priority Tier costs are not in its cost endpoint.

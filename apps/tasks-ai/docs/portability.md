# TasksAI — Capture, search, import & portability (M05)

## Global search

`GET /workspaces/{slug}/search?q=&types=` — Postgres `websearch_to_tsquery`
over tasks, projects, comments; trigram/`ILIKE` for labels. Every statement
is scoped by `workspaceId`; for **guests** it is further scoped to projects
they belong to, so nothing unauthorized can appear (integration-tested).
Empty `q` returns the caller's recent-search list. Saved searches:
`GET/POST /workspaces/{slug}/saved-searches`, `DELETE .../{id}`.

The FTS is correct without indexes; `scripts/search-indexes.sql` adds
expression GIN indexes + `pg_trgm` for scale. These are applied
**out-of-band** (deploy step), not as a Prisma migration, because Prisma's
schema language can't express expression/extension indexes and a tracked
migration would permanently fail the drift check.

## Universal inbox

- **Web quick capture** — already the M03 QuickAdd + `POST /tasks`
  (`source: "quick_capture"`).
- **Capture by email** — one address per workspace:
  `tasks+<base8>-<hmac10>@inbound.tasks-ai.asafarim.com`. The HMAC (keyed by
  a per-workspace secret over the workspace id) makes the address
  unguessable — a spoofed sender who doesn't know it can't inject tasks.
  `GET/POST /workspaces/{slug}/inbound-address` provisions it.
- **Mail webhook** — `POST /api/inbound/email` (outside `/api/v1`).
  Authenticates its own `Authorization: Bearer <TASKSAI_INBOUND_WEBHOOK_SECRET>`
  in constant time, **404s when the secret is unset**, carries no session
  (listed in `proxy.ts` publicRoutes). Replay guard: a `messageId` is
  accepted at most once per workspace (`InboundMessage` unique). Creates a
  task with `source: "import"` provenance.

## Import (CSV / JSON only)

Per the M00 decision, the single evidence-led migration adapter is deferred
until a design partner asks; M05 ships **generic CSV + JSON**.

- `POST /workspaces/{slug}/imports` — `{ kind, filename, projectId, mapping,
  content }`. Parses + validates, stages rows, returns a **dry-run summary**
  (`totalRows`, `okRows`, `failedRows`, `duplicateRows`, first 200 errors).
  **No task is written.**
- `GET /workspaces/{slug}/imports/{id}` — status + summary.
- `POST /workspaces/{slug}/imports/{id}/apply` — applies `ok` rows only.
  **Idempotent + resumable**: each staged row is marked `applied` and
  progress persists every 25 rows, so re-running after success or a crash
  never double-creates (integration-tested).
- `rowKey` is the mapped `externalId` when present, else an FNV-1a hash of
  the mapped fields — a repeated key is flagged `duplicate` and skipped.
- Hostile/malformed files fail with `422 validation_failed` and a reason,
  never a partial write.

## Export & deletion

- `GET /workspaces/{slug}/export?format=json|csv` (admin+). JSON bundles
  workspace/memberships/projects/tasks/comments/labels; CSV emits
  `tasks.csv`. **Formula injection**: any cell starting with `= + - @ TAB
  CR` is prefixed with `'` (`escapeCell`, unit-tested).
- `GET /workspaces/{slug}/deletion-manifest` (owner) — counts of what a
  workspace deletion would remove, plus the note that attachment bytes are
  cleared by a separate retention hook.

## New env

| Var | Purpose |
|---|---|
| `TASKSAI_INBOUND_WEBHOOK_SECRET` | bearer token for `POST /api/inbound/email`; unset ⇒ route 404s |

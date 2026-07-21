# AppBuilder Architecture (M01–M05)

**Application:** `apps/appbuilder`
**Document date:** 2026-07-21
**Scope:** M01 (architecture contract, app scaffold, local runtime), M02
(dedicated PostgreSQL service, migrations, repository boundary), M03
(platform SSO, centralized per-app authorization, app registry, audit
identity), M04 (versioned application-specification contract and
deterministic controlled-operation engine), and M05 (generated-app catalog
and prompt-first creation flow). See
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29)
for the full 12-milestone delivery series,
[ADR 0001](adr/0001-appbuilder-managed-runtime.md) for the architectural
decision behind the metadata-driven runtime, and
[`packages/appbuilder-schema/README.md`](../packages/appbuilder-schema/README.md)
for the full M04 specification/operation contract.

## Summary

AppBuilder is a Next.js 16 / React 19 app in the ASafarIM pnpm/Turborepo
monorepo. It will let a signed-in user describe an internal business
application, get back a versioned application specification, preview it,
refine it conversationally, validate it, and publish an immutable release.

M01 established the app shell and route contracts. M02 added AppBuilder's own
isolated PostgreSQL database, migration lifecycle, and a repository layer
that enforces owner/collaborator + app scoping on every read and write. M03
wires that repository layer to the platform's shared SSO session, registers
AppBuilder in the platform app registry, and replaces the placeholder
owner/collaborator checks with a single capability-based policy every page,
API route, and future milestone must go through. M04 defines what that
policy actually *protects*: a versioned `ApplicationSpecification` contract
and a pure, deterministic controlled-operation engine
(`@asafarim/appbuilder-schema`), integrated with M02's persistence and M03's
authorization via real optimistic concurrency, payload-checked idempotency,
and destructive-change confirmation. AI calls, the preview runtime, and the
catalog UI remain separate, sequenced milestones (see below), each gated on
the previous one's acceptance criteria.

## Local runtime

| | |
| --- | --- |
| Dev port | `3006` (`pnpm --filter @asafarim/appbuilder dev`) |
| Health check | `GET /api/health` |
| Design system | `@asafarim/ui` (consumed directly; no forked components) |
| Docker | `apps/appbuilder/Dockerfile`, standalone output, not yet wired into `docker-compose.prod.yml` (production routing is M11) |
| Auth | Shared `@asafarim/auth` session; `proxy.ts` protects every route except `/` and `/api/health` |

## Route contracts

Defined in [`apps/appbuilder/lib/routes.ts`](../apps/appbuilder/lib/routes.ts)
and unit-tested in `lib/routes.test.ts`.

| Route | Purpose | Access (M03) | Real behavior ships in |
| --- | --- | --- | --- |
| `/` | Landing / product overview | Public (mirrors Hub's own root) | — |
| `/apps` | Catalog of the actor's owned/shared generated apps — search, status/access filters, sort, pagination (M05, live) | Authenticated session required; results are actor-scoped inside the repository | Live (M05) |
| `/apps/new` | Prompt-first creation form: name, prompt, starter family, visibility (M05, live) | Authenticated session required | Live (M05); AI interpretation of the prompt ships in M07 |
| `/apps/[appId]` | Truthful continuation/overview: status, role, draft version, preview/release summaries, archive/restore actions (M05, live) | Session + `app.view` capability (404 if inaccessible) | Live overview (M05); the rich builder workspace ships in M08 |
| `/apps/[appId]/archive`, `/apps/[appId]/restore` | Explicit-confirmation lifecycle controls (M05, live) | Session + `app.archive`/`app.restore` capability (owner-only) | Live (M05) |
| `/apps/[appId]/preview` | Metadata-driven preview runtime | Session + `app.viewPreview` capability (404 if inaccessible); linked from the catalog/overview only when a `preview_builds` row has `status: "succeeded"` | M06 (template registry + preview runtime) |

Every route currently renders as a defined, empty/informational shell (using
the shared `EmptyState` / `Alert` primitives) rather than a 404 or a stub
that silently does nothing — each page states which milestone fills it in.
As of M03 every route is also access-controlled for real: the two static
routes require merely an active session (enforced by `proxy.ts`, checked
again server-side for defense in depth), and the two `[appId]` routes
additionally require the actor to have at least viewer access to that
specific app, via the same `assertCapability` chokepoint the repository
layer uses — an unrelated authenticated user gets Next's `notFound()`
boundary, not a 403 that would confirm the app exists.

## Isolation and trust boundary

- AppBuilder's own metadata store (M02) is a dedicated PostgreSQL service
  (`appbuilder-postgres`, `APPBUILDER_DATABASE_URL`), isolated from the
  platform's shared Prisma database and from every other app's own
  database — the same pattern already used by Testora (`apps/testora`, its
  own Drizzle/Postgres service on a dedicated port). AppBuilder product
  tables are never added to `packages/db`.
- SSO user ids are stored only as opaque external principal references
  (`ownerPrincipalId`, `principalId`, `*PrincipalId` columns) — there is no
  foreign key from AppBuilder's database into the platform's `users` table.
- Every app-owned table is reachable through `appId`, and
  `lib/repositories/authz.ts#assertCapability` is the single chokepoint every
  repository method calls before touching data: it resolves the actor's
  effective role (owner, active collaborator, or platform superadmin) and
  checks it against a named capability (`app.view`, `app.editSpecification`,
  `app.manageCollaborators`, ...) — see the full matrix in
  [`apps/appbuilder/README.md`](../apps/appbuilder/README.md#capability-matrix).
  There is no unscoped "get by id" or "get all" helper for tenant-owned
  data, and no parallel authorization implementation anywhere in the app.
- **Leak prevention**: an actor unrelated to an app (not owner, not an
  active collaborator, not superadmin) gets `NotFoundError` — the same
  error as the app simply not existing. An actor who *is* related but
  lacks a capability's minimum role gets `ForbiddenError` instead.
- **Platform superadmin bypass**: `assertCapability` grants a session
  carrying the `superadmin` role owner-equivalent access to any single,
  named app — mirroring `packages/auth`'s existing, documented
  `hasRole`/`getAppAccessDecision` bypass, not a new one invented for
  AppBuilder. It is deliberately *not* applied to `listAppsForActor`.
- Retryable creation/mutation operations (`createApp`, `applyOperation`) are
  idempotent on a caller-supplied key, so a network retry or double submit
  cannot double-create an app or double-apply a specification change.
- Actor identity is resolved once, server-side, from the trusted SSO
  session (`lib/auth/session.ts#getActor`) — repository methods and API
  routes never accept a principal/owner/actor id from a request body,
  query string, or route param.
- Generated apps never execute AI-written source code or load arbitrary npm
  packages; see [ADR 0001](adr/0001-appbuilder-managed-runtime.md) for the
  full rationale and the explicit prohibitions this fixes.

See [`apps/appbuilder/README.md`](../apps/appbuilder/README.md) for the
concrete schema, migration commands, capability matrix, and
backup/restore/rollback runbook.

## Specification engine and shared contract (M04)

`packages/appbuilder-schema` (`@asafarim/appbuilder-schema`) is a
dependency-free (no Next.js/DB/auth/AI) package holding:

- `ApplicationSpecification` — the versioned Zod contract (identity,
  branding, entities/fields/relations, roles/permissions,
  navigation/pages/components, dashboard, actions, workflows), every
  cross-reference keyed by a stable opaque id, never a display name.
- `Operation` — the allowlisted, discriminated-union catalog (entity/field/
  relation/page/component/navigation/role/permission/workflow/branding
  lifecycle operations) and `applySpecOperation` — a **pure** function:
  validate the operation payload, check preconditions, apply as an
  immutable transform, re-validate the *entire* resulting specification,
  and return a structured result. No `Date.now()`, no random ids, no
  locale-dependent sorting inside it — every id/timestamp the engine needs
  is supplied by the caller.
- `invertOperation`, `diffSpecifications`, `classifyDestructiveChange` —
  undo, structured compare, and destructive-change classification.
- `canonicalize`/`checksumOf` — deterministic serialization (sorted object
  keys, untouched array order, no locale-aware comparison) and its sha256
  checksum: the same base + ordered operations + engine version always
  reproduces the same specification and checksum.

AppBuilder's `lib/repositories/operations.ts#applyOperation` integrates
this pure engine with persistence and authorization: `app.applyOperation`
capability required; the specification row is locked (`FOR UPDATE`) and
the caller's `baseVersionNumber` checked against it before the engine runs
(optimistic concurrency, proven correct under real concurrent Postgres
transactions — two racing writers against the same base: exactly one
succeeds, the other gets a structured `StaleVersionError`, neither user's
work is lost or silently merged); a `request_hash` on `applied_operations`
makes retries with the same idempotency key safe and a differing payload
under the same key a rejected conflict; a change the engine classifies as
destructive is refused unless the caller confirms. Every successful change
is exactly one new immutable `specification_versions` row (with
`parentVersionId`, `schemaVersion`, `engineVersion`, `summary`, `checksum`)
committed atomically with its `applied_operations` row and an audit event;
any failure at any stage leaves the database exactly as it was.
`lib/repositories/versions.ts` adds `restoreVersion` (copy an old version
forward as a new one — history is never rewritten) and `undoLastOperation`
(apply the safe inverse of the last change, or an explicit "restore
required" result when none exists).

## Catalog, creation, and lifecycle (M05)

### Lifecycle/status model

- `apps.status`: `"active" | "archived"`. Archival is the only lifecycle
  transition in M05 — there is no hard delete. While archived,
  `assertCapability` rejects every mutating capability except `app.archive`
  and `app.restore` themselves (`ConflictError`, "restore it before
  performing…") — an archived app cannot accidentally accept a normal edit.
- `specifications.status` stays `"draft"` through M05 (`"published"` is a
  later milestone's concern).
- `preview_builds.status` (`queued|running|succeeded|failed`) and
  `releases.status` (`draft|published|archived`) are read-only signals in
  M05 — nothing in this milestone creates real preview or release rows; the
  catalog/overview just displays the most recent one if M06/M11 (or a test)
  created one.

### Catalog query contract

`GET /apps` and `GET /api/apps` both normalize their query params through
[`lib/validation/catalogQuery.ts`](../apps/appbuilder/lib/validation/catalogQuery.ts)
before they ever reach the repository:

| Param | Values | Default | Fallback on unknown/malformed |
| --- | --- | --- | --- |
| `q` | free text, whitespace-normalized, capped at 200 chars | — | dropped |
| `status` | `active` \| `archived` \| `all` | `active` | `active` |
| `access` | `all` \| `owned` \| `shared` | `all` | `all` |
| `sort` | `updated` \| `created` \| `name` | `updated` | `updated` |
| `page` | positive integer, capped at 100,000 | `1` | `1` |

`lib/repositories/apps.ts#listCatalogForActor` applies every predicate —
ownership/collaboration, status, access, and search — inside the SQL query
itself (parameterized Drizzle query builder calls, never string
concatenation); nothing is fetched unscoped and filtered in memory. Search
uses `ILIKE` against `name`/`description` with `%`/`_`/`\` escaped in the
user's input first, so a search for a literal `%` or `_` cannot be
interpreted as a wildcard. `apps` gained `status`, `updated_at`,
`created_at`, and `name` indexes (migration `0002`) to keep this cheap as
the registry grows. Per-row display metadata (current draft version,
preview status, release status, starter family) is fetched in one batched
query per catalog page (`lib/repositories/appOverview.ts#listCatalogMetadata`),
not one query per row — and catalog responses never include a
specification's JSON `payload`.

### Creation transaction

`POST /apps/new` (Server Action) and `POST /api/apps` both validate through
the same shared schema
([`lib/validation/createApp.ts`](../apps/appbuilder/lib/validation/createApp.ts):
bounded/whitespace-normalized name and prompt, reserved-name and
route-collision checks, closed starter-family/visibility enums, no `<`/`>`
in free text) and then call the single `createApp` transaction
(`lib/repositories/apps.ts`), which atomically:

1. Inserts the `apps` row (owner from the trusted session actor, never the
   request body).
2. Inserts the `specifications` container row with
   `currentVersionNumber: 1`.
3. Inserts `specification_versions` version 1 — `@asafarim/appbuilder-schema`'s
   `emptySpecification()`, the same valid empty/base contract M04's
   operation engine already treats as an app's implicit starting point.
4. Inserts one `creation_requests` row (new in M05 — see migration `0002`)
   holding the user's raw prompt and chosen starter family, for M07 to
   interpret later. This is product state, not an audit entry, so it isn't
   folded into `audit_events.metadata`.
5. Records an `app.created` audit event.

All five writes happen in one Postgres transaction; any failure (e.g. a
slug collision) rolls back every row, including the idempotency ledger
entry (see below). M05 deliberately does **not** insert a `collaborators`
row for the owner — M03 already established `apps.ownerPrincipalId` as the
sole source of truth for ownership (`collaborators.ts#assertNotOwner`
rejects an owner row anywhere else), and duplicating that here would
contradict the invariant, not fulfill it.

### Idempotency

`createApp` reuses M02's generic `idempotency_keys` ledger
(scope `"create-app"`, unique on `(owner_principal_id, scope, key)`): the
`/apps/new` page generates one UUID per page render and carries it as a
hidden form field, so a double-click, browser back-and-resubmit, or network
retry of the *same* rendered form reuses the same key and replays the
original app instead of creating a second one. Reusing a key with a
different request payload is rejected with `ConflictError` (409). Because
creation redirects to `/apps/[appId]` on success (POST → redirect → GET),
refreshing the success page only re-runs the `GET`, never the `POST` — no
duplicate is possible from a refresh either. `archiveApp`/`restoreApp` are
independently idempotent (a repeat call when the app is already in the
target state is a no-op success, not an error or a duplicate audit event).

### Archive / restore

Owner-only (`app.archive`/`app.restore` capabilities), reached only through
a dedicated confirmation page (`/apps/[appId]/archive`,
`/apps/[appId]/restore`) rather than a client-side modal — this keeps the
action keyboard/screen-reader accessible with zero client JS and matches
the platform's "no native dialogs" convention without inventing a bespoke
modal component. Both mutations are transactional (lifecycle state +
audit event together) and idempotent. Unauthorized attempts (editor/viewer,
or an unrelated actor) get the same `ForbiddenError`/`NotFoundError`
leak-prevention behavior as every other app-scoped mutation.

### Explicit M06/M07/M08 deferrals

M05 records intent and provides truthful, database-backed UI — it does
**not** call an LLM, interpret the prompt, render a registered
template/component, run a functional preview, or provide the conversational
builder workspace. `/apps/[appId]/preview` still renders the M01 shell;
`/apps/new`'s success copy explicitly says the app is "a draft awaiting
configuration," never that anything was generated.

## Milestone map (for orientation)

1. M01 — Architecture contract, app scaffold, local runtime.
2. M02 — Dedicated PostgreSQL service, migrations, repository boundary.
3. M03 — Platform SSO, authorization, app registry, audit identity.
4. M04 — Versioned application specification and operation engine.
5. **M05 — this milestone.** Generated-app catalog and prompt-first creation flow.
6. M06 — approved template/component registry and preview runtime.
7. M07 — AI requirements planner and structured generation pipeline.
8. M08 — builder workspace, conversational changes, version history.
9. M09 — generated-data engine, RBAC, relations, basic workflows.
10. M10 — validation gates, preview QA, bounded AI repair loop.
11. M11 — immutable releases, generated-app deployment, domain routing.
12. M12 — launch hardening, observability, backups, quotas, custom domains.

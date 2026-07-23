# AppBuilder Secure Generated-Data Engine, RBAC, Relations, and Basic Workflows (M09)

Milestone 9 of 12 in [#29](../../issues/29). Depends on M08 ([#37](../../issues/37),
implemented in [#49](../../pull/49)). Gives the *generated* app — the one a
builder is designing, not AppBuilder itself — a real, secure place to store
and query records, a membership/RBAC model of its own, relations, files, and
bounded workflows. M06's demo-data preview is untouched; this milestone adds
a **parallel, opt-in live path** at the exact same preview route.

## Core principle: two separate identity systems

M03's `owner`/`editor`/`viewer` roles (`apps/appbuilder/lib/repositories/authz.ts`)
govern the **AppBuilder development workspace** — who may edit a
specification, request AI changes, restore versions, manage collaborators.

M09 roles — e.g. `admin`/`manager`/`employee_role` in the task-management
template — are defined **inside the pinned specification's `roles` array**
(`@asafarim/appbuilder-schema`'s `Role`) and govern use of the **finished,
generated application**. They are validated against the pinned spec on every
write and stored in `generatedAppMembers.roleIds`.

**An AppBuilder editor is never automatically a generated-app administrator.**
The only bridge between the two systems is `bootstrapOwnerAsAdmin`
(`lib/generated-data/membership.ts`) — itself a builder-side action, gated by
the builder capability `app.manageGeneratedMembers` (owner-rank), which
creates one explicit, auditable membership row for the app's owner. Every
other membership mutation is equally builder-gated. There is no second
authentication system: every generated-app member id is a real platform SSO
principal id, resolved server-side from the trusted session — never accepted
as an authoritative claim from a client.

## Membership model

`generatedAppMembers` (`lib/db/schema.ts`): `appId`, `principalId`
(trusted SSO id), `roleIds` (validated against the pinned spec's role ids on
every write — see `UnknownRoleIdError`), `status` (`active`/`revoked`),
`provenance` (`owner_bootstrap`/`invited`), `invitedByPrincipalId`,
timestamps.

`lib/generated-data/membership.ts`:

- `bootstrapOwnerAsAdmin` — idempotent; always targets `apps.ownerPrincipalId`
  specifically (never a superadmin acting via the M03 bypass).
- `addMember` / `changeMemberRoles` / `revokeMember` — builder-gated
  (`app.manageGeneratedMembers`), each emits an `recordAuditEvent`.
- **Final-admin protection**: the "admin" role is derived from whichever
  role the app's very first `owner_bootstrap`-provenance member holds — not
  a dedicated column. `changeMemberRoles`/`revokeMember` reject a change
  that would leave zero active members holding that role
  (`FinalAdminProtectionError`).
- `getOwnMembership` — any authenticated platform user may ask "am I a
  member of this app"; never gated.

## Storage: safe, metadata-driven, never dynamic SQL tables

Every generated record lives in AppBuilder's **own** Postgres, in generic,
already-migrated tables — never a per-app physical table or arbitrary SQL:

| Table | Purpose |
| --- | --- |
| `generatedRecords` | entity records — `data` is validated JSONB, keyed by field **id** (never `machineName`) |
| `generatedRecordRevisions` | append-only prior-version snapshots (optimistic-concurrency audit trail) |
| `generatedRecordRelations` | resolved relation edges (`fromRecordId` → `toRecordId`, keyed by `relationId`) |
| `generatedUniquenessClaims` | per-field uniqueness enforcement via a real unique DB index, not app-level locking |
| `generatedFiles` | file metadata bound to app/entity/record/field |
| `generatedActivity` | append-only activity feed |
| `generatedNotifications` | per-member notifications |
| `generatedWorkflowExecutions` / `generatedWorkflowStepExecutions` | durable, auditable workflow runs |
| `generatedDataIdempotency` | replay-safety for create/update, keyed by (appId, entityId, scope, idempotencyKey) |
| `generatedRowAccessRules` | declarative row-scoping rules (own/assigned/relatedToParent/all) per (appId, entityId, verb, roleId) |

Every row is scoped by **both** `appId` and a valid `entityId` — `lib/generated-data/records.ts`
deliberately has no `getRecord(recordId)` or unscoped list helper anywhere;
every query's `WHERE` clause includes both. Forbidden by construction:
unscoped record lookups, arbitrary SQL/JSONPath/regex filters, client-selected
ownership, cross-app relation lookups.

## Typed validation (`lib/generated-data/validation.ts`)

`validateRecordData(spec, entityId, input, {partial})` is the only place a
client-supplied record payload is ever trusted, and only after passing
through it: rejects unknown fields/entities, protected system-field keys
(`PROTECTED_SYSTEM_FIELD_NAMES` — id/appId/entityId/revision/status/
timestamps/etc., which live as real DB columns, never inside `data`),
required/default/length/range/boolean/date/email/url/select/relation/file
type checks, and unsafe content/URLs (`isContentSafe`,
`@asafarim/appbuilder-schema`). Relation target existence/cross-app checks
and file existence/ownership need a DB round trip this pure function
deliberately doesn't make — those live in `relations.ts`/`files.ts`.

## Runtime authorization (`lib/generated-data/runtimeAuth.ts`)

The **one** central authorization layer for the generated app's own runtime —
every runtime API route resolves a `RuntimeContext` first (`resolveRuntimeContext`)
and checks every read/write against it. **UI visibility is never itself a
control**: a client that hides a button still hits this same server-side gate
if it calls the API directly.

- `loadPinnedSpec` resolves the app's **pinned, successfully-built preview
  version** — never the latest draft. A builder can be mid-conversation
  (M08) editing a draft while generated-app members keep using the last
  pinned version undisturbed, exactly mirroring M06's preview resolution.
  Both the runtime API and the M09 demo-data seeder (`seed.ts`) require and
  use this same pinned version, so seeded records are never stamped with a
  version number the runtime can't actually serve.
- `hasPermission(spec, roleIds, entityId, verb)` — deny wins over allow when
  a member holds multiple roles with conflicting grants; absence of any
  matching permission is a deny (default-closed).
- `canViewPage` / `listPermittedPageIds` — page-level gating by
  `page.requiredRoleIds`.
- **Row-level access** (`resolveRowAccessScope` / `recordSatisfiesScope`):
  a controlled, declarative, non-executable rule per (entity, verb, role) —
  `own` / `assigned:<fieldId>` / `relatedToParent:<relationId>` / `all`.
  Never `eval`, never a generated SQL fragment. The least-restrictive scope
  across every role a member holds wins. Absence of a configured rule for an
  otherwise-allowed permission means unrestricted access to every row the
  entity permission itself allows. There is no builder UI to configure these
  yet — `generatedRowAccessRules` rows exist today only via the M09 demo
  seeder; a configuration UI is deferred (see "Deferred to later milestones").
- **Field-level restriction**: M04's `Permission` schema is entity+verb only,
  not field-scoped. M09's documented, narrower interpretation: entity-level
  read/update permission is the primary gate; relation-field expansion
  (resolving a relation's target record) is where field-level restriction
  concretely manifests today, since expanding a relation re-runs the same
  entity-level `read` check against the target entity.

## Records, concurrency, and lifecycle (`lib/generated-data/records.ts`)

`createRecord` / `getRecord` / `updateRecord` / `archiveRecord` /
`restoreRecord`. **No hard delete anywhere in this module.**

- `updateRecord` is optimistic-concurrency controlled: a stale `baseRevision`
  fails closed with `StaleRecordRevisionError(currentRevision, baseRevision)`
  **without** overwriting the current row; the previous version is preserved
  in `generatedRecordRevisions`.
- `archiveRecord` requires the `delete` permission verb (the closest existing
  verb to "remove" — there is no dedicated `archive` verb in
  `@asafarim/appbuilder-schema`'s `PERMISSION_VERBS`, and no hard-delete path
  for it to be confused with) and applies the specification's relation
  `onDelete` behavior (`cascade`/`setNull`, bounded to `MAX_CASCADE_DEPTH = 8`
  — see `relations.ts#applyDeleteBehaviorOnArchive`).
- `restoreRecord` requires `update`.
- Both create and update are idempotent per a client-supplied (or
  server-generated) key, recorded in `generatedDataIdempotency` — a retried
  request with the same key and payload replays the same result rather than
  duplicating a record, an activity row, or a workflow side effect.

## Bounded query engine (`lib/generated-data/query.ts`)

`listRecords` is the **only** way to list generated records — pagination
(`QUERY_LIMITS.MAX_PAGE_SIZE = 100`, default 25), allowlisted field filters
(`MAX_FILTERS = 10`, each checked against the entity's real, non-archived
field ids), relation filters, sorting, bounded `ILIKE` search over
string-typed fields (`MAX_SEARCH_LENGTH = 200`) — never arbitrary SQL,
JSONPath, regex, or executable expressions. Every filter/sort/search value is
a bound parameter. Row-access scoping (see above) is applied as an
additional SQL condition, not a post-fetch filter, so pagination totals stay
correct. `getDashboardCounts` / `getGroupedCounts` are single bounded
aggregate shapes (a scoped count per entity; a group-by count over one select
field) — never an arbitrary aggregate expression.

## Relations (`lib/generated-data/relations.ts`)

`validateRelationTarget` enforces same-app existence and blocks cross-app
injection outright (a relation value pointing at another app's record id
fails the same way a nonexistent id would). Cardinality and `onDelete`
behavior come from the specification's `relations[]` array; archiving a
record with children pointing at it recursively applies each relation's
`onDelete`, bounded to depth 8 to prevent unbounded recursion from a
misconfigured or cyclical relation graph.

## Schema evolution (`lib/generated-data/schemaEvolution.ts`)

Every record carries the `specVersionNumber` it was written against.
Classification is deliberately conservative — **no automatic destructive
migration ever runs**:

- **Safe**: a new optional/defaulted field, a label change, an archived
  field (still recoverable — archiving a field never deletes its data from
  existing records).
- **Needs review**: a field's type change, tightening `required`/`unique` on
  a field that has existing records.
- **Blocked**: nothing here performs a migration at all — `checkExistingRecordsAgainstField`
  only reports whether existing data would still pass; the builder is
  responsible for deciding what to do next (deferred to a later milestone).

## Basic workflows (`lib/generated-data/workflows.ts`)

Allowlisted triggers (`onCreate`/`onUpdate`/`onArchive`, plus field-change and
assignment-change detection) and allowlisted actions (record activity, a
member notification, an allowlisted field update, dashboard-count
recomputation, one bounded chained workflow step). **Forbidden by
construction**: arbitrary JS, outbound HTTP, webhooks, shell execution,
email, or any infrastructure change.

Workflows run **synchronously, inside the same DB transaction as the
triggering record mutation** — a deliberate simplification from M07/M08's
BullMQ-based async dispatch, since every allowlisted step is a fast, bounded
DB write. This makes retry-safety trivial: a workflow run is keyed by the
same idempotency mechanism as the record mutation that triggered it, so
retrying a mutation never duplicates the activity/notification/field-update
side effects a workflow produced. Chained steps are cycle-limited.

## Files (`lib/generated-data/files.ts`)

Built on `@asafarim/storage`'s S3-compatible boundary, which falls back to a
deterministic local directory automatically in dev/test — no external
dependency required to exercise this path in CI. `initUpload` → client
upload → `commitUpload` → `getDownloadAuthorization` (mints a short-lived
HMAC-signed download token, `crypto.createHmac`/`timingSafeEqual`) →
`downloadFile` (token-only auth, no session lookup — safe to hit directly
from a signed URL). MIME/size allowlists are enforced server-side
(`FileTooLargeError`/`UnsupportedMimeTypeError`); expired links fail closed
(`SignedLinkExpiredError`). The client never controls the storage key, and
original filenames/client-claimed MIME types are never trusted alone.
**Malware scanning is out of scope for this milestone** — files are
allowlisted by MIME/size only; do not treat that as a substitute for content
scanning in a production deployment.

## Preview seed/reset (`lib/generated-data/seed.ts`)

`resetGeneratedData` is a **preview-only** convenience: builder-gated
(`app.resetGeneratedData`, editor-rank), requires an explicit
`{"confirm": true}` body, requires a pinned preview to already exist,
**blocked outright** for any app with a published release
(`ReleasedAppResetError`), transactional (all-or-nothing), audited, and
idempotent. It deterministically seeds the exact task-management template
shape (`packages/appbuilder-runtime/src/templates/taskManagement.ts`'s ids)
and bootstraps the app owner as the first generated-app admin in the same
transaction. **Never exposed to, or reachable by, a generated-app end
user** — there is no capability path from an ordinary member to this
endpoint, only from a real AppBuilder collaborator.

## Live preview integration

The M06 demo preview (`renderPreview`, `@asafarim/appbuilder-runtime`) is
**unmodified** — it stays a pure, server-rendered, demo-data-only path with
permanently disabled forms (an RSC constraint: a Server Component can't
attach a real `onSubmit`). M09 adds a parallel, **apps/appbuilder-only**
Client Component tree under `app/apps/[appId]/preview/[[...path]]/live/`
that is never imported by, or added to, the shared `@asafarim/appbuilder-runtime`
package — so every other consumer of that package is unaffected.

The single route `/apps/{appId}/preview[/...path]` serves three audiences
(see the docstring at the top of `page.tsx` for the exact branching):

1. **Builder demo mode** (default) — unchanged M06 behavior, plus a small
   "Switch to live data →" link for a builder collaborator.
2. **Builder live mode** (`?mode=live`) — the same collaborator, but backed
   by real Postgres data through the M09 runtime API. If the collaborator
   has no generated-app membership yet, they see a "seed demo data"
   affordance (reusing the M09 seeder) instead of a dead end.
3. **Builder role simulation** (`?simulateRoleId=<roleId>`) — only reachable
   by an actor who already holds real builder `app.viewPreview` capability
   (independently re-verified on **every** API call this mode makes, via
   `routeHelpers.ts#resolveContextForRequest` — never trusted from a
   client-set query string alone). Renders the same live tree under a
   fabricated role, with a persistent "Viewing as: X (simulated)" badge.
   Simulation never writes a real `generatedAppMembers` row and never
   grants any permission the underlying session doesn't otherwise have —
   every mutation it makes is authorized exactly as if that role's own
   member had made it, nothing more.

A genuine generated-app end user — a platform principal with real M09
membership but **no** M03 collaborator rank on this app at all — reaches
live mode automatically at the same URL; they have no builder-only
affordance to see or use.

Within live mode, `LivePageComponents.tsx` groups a `dataTable`+`form`+
`detailView` bound to the same entity into one "entity workspace" (shared
selection + refresh state — table row click selects the record shown below;
a "+ New" toggle reveals the create form), and dispatches every other
component kind (`statWidget`, `chartWidget`, Kanban, calendar, a static
settings panel) to its own live renderer. Kanban/calendar stay read-only,
matching M06's own no-drag-and-drop accessibility policy — the entity's
table/detail page remains the single place writes happen.

The pinned specification's structure (field names, types, options — never
record data) is passed from the Server Component to the live Client
Component tree as props, the same way M06's `renderPreview` already embeds
the full spec into server-rendered HTML for any authorized preview viewer.
This is a deliberate parity decision, not an oversight: spec **structure**
alone is not sensitive (it reveals no data), and the runtime API — not the
rendered UI — is the actual authorization boundary for every read/write.

## Runtime API surface

Every route under `app/api/apps/[appId]/runtime/`: resolves the trusted
session, resolves a `RuntimeContext` (membership + pinned spec), enforces
runtime permissions, scopes every query by app+entity, validates input
through `validation.ts`, and returns safe, structured errors
(`lib/http/errors.ts`) — never a raw stack trace, SQL error, or an app/record
the caller can't access (a non-member gets the same `404` a nonexistent app
would). `session` returns only the caller's own roleIds/permittedPageIds —
never the complete internal specification.

| Route | Purpose |
| --- | --- |
| `GET /runtime/session` | "who am I / what can I do" |
| `GET,POST /runtime/entities/{entityId}/records` | bounded list / create |
| `GET,PATCH /runtime/entities/{entityId}/records/{recordId}` | fetch / optimistic update |
| `POST .../records/{recordId}/archive`, `/restore` | soft lifecycle |
| `GET /runtime/dashboard`, `/runtime/entities/{entityId}/grouped-counts` | bounded aggregates |
| `POST /runtime/files/upload-init`, `/files/{fileId}/commit`, `/authorize`; `GET /files/{fileId}/download` | file boundary |
| `GET /runtime/notifications`, `POST .../read` | per-member notifications |
| `GET,POST /runtime/members`, `PATCH,DELETE /runtime/members/{memberId}` | builder-only membership admin |
| `POST /runtime/seed-reset` | builder-only preview reset |

## Auditability

Every membership change, record mutation, workflow run, and demo-data reset
records who acted and how: a real generated-app member (`actorKind: "member"`),
a workflow executing on that record's behalf, or the builder-side system
actions above (bootstrap, seed/reset) — distinct from `apps/appbuilder/lib/repositories/audit.ts`'s
own M03 builder-workspace audit trail.

## Deferred to later milestones

Explicitly out of scope for M09: a builder UI to configure row-access rules;
automatic destructive schema migration; arbitrary generated-database tables
or SQL; unrestricted outbound webhooks; payments; real-time collaboration; a
public app marketplace; automated QA/repair of generated data; production
deployment/custom domains; per-app physical databases; malware scanning for
uploaded files. M10 is not started by this milestone.

# @asafarim/appbuilder-schema

Versioned application-specification contract and deterministic
controlled-operation engine for AppBuilder (M04). This package is
intentionally dependency-light: **no Next.js, no database, no auth, no AI
provider, no browser API.** It is safe to import from AppBuilder's server
code, the future metadata-driven runtime (M06), the future AI orchestrator
(M07), migration tooling, and plain Node scripts/tests alike.

## What's here

- `ApplicationSpecification` — the Zod contract for a generated app's
  entire structure (identity, branding, entities/fields/relations,
  roles/permissions, navigation/pages/components, dashboard, actions,
  workflows).
- `getSpecificationJsonSchema()` — generates a JSON Schema from the same
  Zod contract (`pnpm build:json-schema` writes it to
  `dist/specification.schema.json`).
- `validateSpecification(spec)` — semantic validation beyond Zod's shape
  parsing: uniqueness, reserved names, referential integrity, duplicate
  indexes/permissions, workflow-cycle detection, and a content-safety sweep.
- `Operation` — the allowlisted, discriminated-union operation catalog
  (see below) and `applySpecOperation(spec, rawOperation, options)` — the
  pure, deterministic engine that validates, applies, and re-validates in
  one call.
- `invertOperation`, `diffSpecifications`, `classifyDestructiveChange` —
  undo, compare, and destructive-change classification, all pure functions
  operating only on `ApplicationSpecificationType` values.
- `canonicalize` / `checksumOf` — the documented deterministic
  serialization + checksum algorithm.
- `fixtures/` — a representative construction task-management app, plus
  adversarial fixtures for every attack/error category M04 must reject.

## Specification format and version policy

`schemaVersion` is a Zod `literal` (`SPEC_SCHEMA_VERSION`, currently
`"1.0.0"`) — parsing a specification against the wrong schema version fails
loudly rather than silently coercing. A schema-shape change that isn't
purely additive (removing a field, changing a type, tightening a
constraint) must bump `SPEC_SCHEMA_VERSION`; consumers decide explicitly
how to migrate stored specifications written against an older version
(there is no automatic migration in M04 — see "Schema/operation migration
strategy" below).

`ENGINE_VERSION` is stored on every persisted specification version
(`specification_versions.engine_version` in AppBuilder's database) — it is
what actually produced a version's payload/checksum, and is distinct from
`schemaVersion` (the *shape* the payload conforms to). Reproducing a
checksum requires both.

## Stable ID / reference rules

Every entity, field, relation, role, permission, page, component,
navigation item, action, and workflow (step) carries a **stable, opaque
id** (`StableId`: lowercase, alnum/underscore/hyphen, ≤64 chars). All
cross-references — a relation's `fromEntityId`/`toEntityId`, a
`relation`-typed field's `relationId`, a permission's `roleId`/`entityId`,
navigation's `targetPageId`, a component's `entityId` — point at these ids,
**never** at a display name. Display names (`DisplayName`) are freely
editable and never used as a relationship key. `validateSpecification`
rejects any reference to an id that doesn't exist ("orphaned reference").

## Operation catalog

| Operation | Effect |
| --- | --- |
| `CREATE_ENTITY` / `UPDATE_ENTITY` / `ARCHIVE_ENTITY` | Entity lifecycle |
| `ADD_FIELD` / `UPDATE_FIELD` / `ARCHIVE_FIELD` | Field lifecycle within an entity |
| `CREATE_RELATION` / `UPDATE_RELATION` / `ARCHIVE_RELATION` | Named relationship lifecycle |
| `CREATE_PAGE` / `UPDATE_PAGE` / `ARCHIVE_PAGE` | Page lifecycle |
| `ADD_COMPONENT` / `UPDATE_COMPONENT` / `MOVE_COMPONENT` / `REMOVE_COMPONENT` | Page component lifecycle |
| `UPDATE_NAVIGATION` | Full navigation-list replace |
| `CREATE_ROLE` / `UPDATE_ROLE` | Role lifecycle (no archive — see below) |
| `SET_PERMISSION` / `REMOVE_PERMISSION` | Upsert/remove one `(roleId, entityId, verb)` grant |
| `CREATE_WORKFLOW` / `UPDATE_WORKFLOW` / `ARCHIVE_WORKFLOW` | Workflow lifecycle |
| `UPDATE_BRANDING` / `UPDATE_APP_METADATA` | Constrained branding/app metadata merge |

Every operation carries `opVersion` (`OPERATION_SCHEMA_VERSION`) — a
future, backward-incompatible change to one operation's shape bumps this so
`applySpecOperation` can reject (or a later migration tool can translate)
an operation written against an older contract, instead of silently
misinterpreting it.

**Deliberately absent:** there is no operation that emits arbitrary
source code, SQL, JavaScript, HTML, npm package names, shell commands, or
infrastructure definitions. Free-text fields and JSON `config` blobs
(components/actions/workflow steps) are swept by `validateSpecification`'s
content-safety check (script tags, inline event handlers, SQL-injection
shapes, package-manager/shell invocations, `${...}` interpolation, and
dangerous config keys like `__proto__`/`eval`/`process`).

**No `ARCHIVE_ROLE`, no entity/field/relation/page/workflow "delete":**
archival is the only removal primitive for those, and even that is
intentionally absent for roles in M04 (nothing in the current permission
model requires it yet). This shows up directly in what `invertOperation`
can and can't undo (see below).

## Validation lifecycle

Every mutating path goes through the same two-stage validation `Zod →
validateSpecification`:

1. **Shape** (Zod): `Operation.safeParse(rawOperation)` / individual field
   schemas — bounded field types, bounded collection sizes
   (`LIMITS` in `constants.ts`), bounded component/action/workflow-step
   kinds. An unsupported kind fails here, not in application logic.
2. **Semantics** (`validateSpecification`): run once before *and* — inside
   `applySpecOperation` — again immediately after every operation's pure
   transform, against the **entire resulting specification**, not just the
   touched subtree. A structurally valid operation that would leave the
   overall spec broken (dangling reference, duplicate id, reserved name,
   cycle, unsafe content) is rejected and the transform's result is
   discarded — the pure engine never returns a spec that hasn't passed
   both stages.

## Canonicalization / checksum algorithm

`canonicalize(value)`: recursively sorts object keys by plain (non-locale)
UTF-16 code-unit comparison at every level; **arrays are never re-sorted**
(array order is meaningful — component/navigation ordering). `checksumOf`
is `sha256(canonicalize(value))` (Node's `crypto.createHash("sha256")`),
returned as a lowercase hex digest. Given the same base specification, the
same ordered operation sequence, and the same `ENGINE_VERSION`, the result
— and its checksum — is always byte-identical, regardless of object
insertion order or process locale.

## Optimistic-concurrency contract

The engine itself is stateless and has no notion of "current version" —
concurrency is the persistence layer's job (see
`apps/appbuilder/lib/repositories/operations.ts`). The contract: every
mutating call takes a caller-supplied `baseVersionNumber`. AppBuilder's
repository layer row-locks the specification (`SELECT ... FOR UPDATE`)
before comparing it to the actual current version number — so two
concurrent writers can never both succeed against a stale base, even
under real Postgres concurrency (not just sequential-caller checks). A
stale write is rejected (`StaleVersionError`, carrying both
`currentVersionNumber` and the caller's stale `baseVersionNumber`) and
changes **nothing** — neither the rejected writer's nor the winning
writer's version is touched.

## Idempotency contract

A retried request with the same `idempotencyKey` and an operation+base
that hashes identically to the original replays the original persisted
result (same version, same operation row — no duplicates). The same key
reused with a *different* operation or base is rejected
(`ConflictError`) rather than silently replayed or silently applied twice.

## Destructive-change policy

`classifyDestructiveChange(before, after, operation)` flags: entity/field/
relation/page/workflow archival, tightening a field to `required`/`unique`,
widening a relation's `onDelete` to `cascade`, and any permission
transition from `allow` to denied/removed. `applySpecOperation` refuses to
apply a destructive change unless the caller passes
`confirmDestructive: true` — the failure result carries the classification
and human-readable `details` so a caller can render a confirmation prompt
without guessing. M04 never executes a destructive change against any real
generated-app data — there is none at this layer.

## Version comparison, undo, and restore

- **Compare**: `diffSpecifications(before, after)` — path-aware
  added/removed/changed entries per top-level collection (entities also
  diff their nested `fields`/`indexes`; pages their `components`).
- **Restore**: `restoreVersion` (AppBuilder repository) copies an older
  version's payload forward as a **brand-new** version — it never rewrites
  or deletes history. Re-validated against the *current* schema before
  being persisted.
- **Undo**: `invertOperation(before, operation)` returns the exact inverse
  when one exists in the current catalog, or `null` otherwise. Operations
  with a real inverse: `ADD_COMPONENT`↔`REMOVE_COMPONENT` (full
  round-trip), `UPDATE_*` (patch back to prior values), `UPDATE_NAVIGATION`
  (prior full list), `CREATE_ENTITY`→`ARCHIVE_ENTITY`,
  `CREATE_RELATION`→`ARCHIVE_RELATION`, `CREATE_PAGE`→`ARCHIVE_PAGE`,
  `CREATE_WORKFLOW`→`ARCHIVE_WORKFLOW`, `REMOVE_PERMISSION`↔`SET_PERMISSION`.
  **No inverse exists** for any archive operation (no "restore"
  counterpart in the catalog) or `CREATE_ROLE` (no archive-role operation)
  — undoing those returns a "restore required" result; the caller must use
  `restoreVersion` against an earlier version instead of guessing.

## How M06 and M07 must consume this package

- **M06 (metadata-driven runtime)**: read `ApplicationSpecificationType`
  and render from it. `COMPONENT_KINDS`/`ACTION_KINDS` are the validation
  allowlist for what a specification may *reference* — M06 owns the actual
  rendering registry mapping each kind to real UI, but must not weaken
  `validateSpecification`'s allowlist to accept a kind it doesn't render;
  extending the kind set is a schema-version-bumping change here first.
- **M07 (AI orchestrator)**: never emits `ApplicationSpecificationType`
  directly. It emits `Operation` values (validated the same way any other
  caller's operations are) against the current draft, through
  AppBuilder's `applyOperation` repository call — it gets no special
  bypass of validation, concurrency, idempotency, or destructive
  confirmation.

## Schema and operation migration strategy

Both `SPEC_SCHEMA_VERSION` and `OPERATION_SCHEMA_VERSION` are literal
strings baked into the Zod contract — there is no coercion or best-effort
parsing across versions in M04. A future version bump ships alongside an
explicit migration path (a documented transform from the old shape to the
new one) before any consumer is allowed to write the new version; reading
an old version's stored payload for display/diff/restore does not require
migrating it in place, since it's replayed byte-for-byte, not re-parsed
against a newer, incompatible schema.

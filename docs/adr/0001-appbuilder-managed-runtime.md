# ADR 0001: AppBuilder uses a metadata-driven managed runtime, not generated code

**Status:** Accepted
**Date:** 2026-07-21
**Related:** [Issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29) (epic), [Issue #30](https://github.com/AliSafari-IT/asafarim-platform/issues/30) (M01)

## Context

AppBuilder lets a signed-in user describe an internal business application in
natural language and get a working CRUD app back: a data model, a UI, and
basic workflows, previewable at `/apps/{appId}/preview` and iterated on
conversationally.

There are two fundamentally different ways to build this:

1. **Code generation.** The AI emits source files (React components, API
   routes, possibly arbitrary server logic) which are compiled/deployed as a
   real, separate application per tenant.
2. **Metadata-driven managed runtime.** The AI emits and edits a **versioned,
   validated application specification** (entities, fields, relations, views,
   simple workflows) stored as data. A single, platform-owned runtime
   interprets that specification to render the UI, enforce access, and run
   generated-data CRUD/queries. No tenant-specific source code exists or
   executes.

This decision has to be made before the app shell exists, because it
determines the trust boundary, the data model, the deployment topology, and
what "publish a release" even means later in the series (M11).

## Decision

AppBuilder MVP uses a **metadata-driven managed runtime**. Concretely:

- A generated application is a **versioned specification** (JSON/structured
  rows), not a folder of source files. "Editing an app" means proposing and
  applying **approved operations** against that specification, not rewriting
  arbitrary code (see M04).
- One shared, platform-maintained runtime renders every generated app from
  its current specification version. There is no per-app build, no per-app
  container, and no per-app source repository in the MVP.
- The AI **never** emits arbitrary server code, arbitrary client code, or an
  arbitrary npm dependency list for a generated app. It only emits operations
  against a constrained schema (add entity, add field, add view, add a
  bounded workflow step, ...) that a validator accepts or rejects.
- Generated apps are built exclusively from an **approved
  template/component registry** (M06) — a fixed catalog of vetted UI
  patterns and field/view types the runtime knows how to render. There is no
  mechanism for a generated app to reach outside that catalog.
- Every generated-app data access is scoped by the authenticated
  owner/tenant **and** `appId` (M02/M09); AppBuilder's own metadata store is
  isolated from generated-app data, and both are isolated from the shared
  platform Prisma database, matching the isolation pattern already used by
  Testora (`apps/testora`, its own Postgres/Drizzle service).
- Draft/preview changes operate on a working specification version and never
  mutate a **published, immutable release** (M11) directly.

### Explicitly forbidden in the MVP-generated apps

This ADR exists specifically to make these two boundaries binding, not
aspirational, so every later milestone in the series is built against them:

- **No arbitrary server code.** Generated apps cannot execute code written or
  selected by the AI or the end user outside the fixed runtime's own request
  handlers. Business logic is limited to the bounded workflow primitives the
  spec format defines (M09) — never a free-form script, function body, or
  webhook handler.
- **No arbitrary npm packages.** A generated app's behavior is fully
  determined by the platform runtime's own dependency tree. Nothing in a
  specification can name, install, or load a package. New capabilities are
  added by extending the runtime and its approved template registry — a
  reviewed platform change — not by a generated app pulling in code at
  build/run time.

## Consequences

- **Positive:** one attack surface and one thing to secure, patch, and audit
  — not N tenant codebases. Instant preview (no build step per edit).
  Deterministic, diffable, revertible changes (a spec is data). A clean
  place to enforce RBAC, quotas, and validation gates (M09/M10) because every
  generated app goes through the same interpreter.
- **Negative:** the runtime's template/field/view/workflow catalog is a hard
  ceiling on what a generated app can do in the MVP. Expanding capability
  means shipping a platform release, not a per-tenant code change. This is
  an accepted trade-off for the MVP's "internal business CRUD apps" scope
  (see epic #29's product constraints); revisiting it (e.g. a future
  "eject to code" export) is out of scope for this series and is **not**
  scheduled by any milestone above.
- Later milestones build directly on this boundary: M04 defines the
  specification format and the operation engine; M06 defines the approved
  template/component registry the runtime renders from; M09 defines the
  generated-data engine, RBAC, and bounded workflows; M10 adds validation
  gates and a bounded AI repair loop that still only ever emits spec
  operations, never code.

## Alternatives considered

- **Generated source code per tenant, deployed as its own app** — rejected
  for the MVP: unbounded security surface (arbitrary code execution per
  tenant), no shared way to enforce quotas/RBAC/validation, expensive to
  preview (build/deploy per edit), and hard to make edits deterministic or
  revertible. Left as a possible **future, explicitly deferred** "code
  export" capability for users who outgrow the managed runtime — not part of
  this series.
- **Low-code visual builder with no AI** — rejected as the sole mechanism:
  doesn't meet the product goal of describing an app in natural language
  (epic #29), though the resulting spec format and runtime are exactly what
  such a builder would need, so the door stays open for a manual editing UI
  on top of the same specification (M08's builder workspace already assumes
  this).

## Scope of this ADR vs. this milestone (M01)

This ADR fixes the architecture. It does **not** by itself implement the
specification format (M04), the metadata store (M02), authorization (M03),
or the template registry/preview runtime (M06). M01 only establishes the
`apps/appbuilder` shell, its route contracts, and local runtime scaffolding
that the rest of the series builds on.

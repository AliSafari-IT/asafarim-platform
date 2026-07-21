# AppBuilder Architecture (M01–M03)

**Application:** `apps/appbuilder`
**Document date:** 2026-07-21
**Scope:** M01 (architecture contract, app scaffold, local runtime), M02
(dedicated PostgreSQL service, migrations, repository boundary), and M03
(platform SSO, centralized per-app authorization, app registry, audit
identity). See
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29)
for the full 12-milestone delivery series and
[ADR 0001](adr/0001-appbuilder-managed-runtime.md) for the architectural
decision behind the metadata-driven runtime.

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
API route, and future milestone (M04 operations, M06 previews, M09/M11
releases) must go through. AI calls and the preview runtime remain separate,
sequenced milestones (see below), each gated on the previous one's
acceptance criteria.

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
| `/apps` | Catalog of the owner/tenant's generated apps | Authenticated session required | M05 (catalog UI) |
| `/apps/new` | Prompt-first creation entry point | Authenticated session required | M05 (creation flow), M07 (AI planner) |
| `/apps/[appId]` | A generated app's detail/overview shell | Session + `app.view` capability (404 if inaccessible) | M04 (specification editing), M08 (builder workspace) |
| `/apps/[appId]/preview` | Metadata-driven preview runtime | Session + `app.viewPreview` capability (404 if inaccessible) | M06 (template registry + preview runtime) |

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

## Milestone map (for orientation)

1. M01 — Architecture contract, app scaffold, local runtime.
2. M02 — Dedicated PostgreSQL service, migrations, repository boundary.
3. **M03 — this milestone.** Platform SSO, authorization, app registry, audit identity.
4. M04 — versioned application specification and operation engine.
5. M05 — generated-app catalog and prompt-first creation flow.
6. M06 — approved template/component registry and preview runtime.
7. M07 — AI requirements planner and structured generation pipeline.
8. M08 — builder workspace, conversational changes, version history.
9. M09 — generated-data engine, RBAC, relations, basic workflows.
10. M10 — validation gates, preview QA, bounded AI repair loop.
11. M11 — immutable releases, generated-app deployment, domain routing.
12. M12 — launch hardening, observability, backups, quotas, custom domains.

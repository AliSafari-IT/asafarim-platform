# ADR-0002 — Row-level `workspaceId` tenant model

**Status:** Accepted (M00) · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

## Context

TasksAI is multi-tenant: many independent workspaces share one database (per [ADR-0001](0001-dedicated-database.md)). Options considered:

1. **Schema-per-tenant** (Postgres schema or DB per workspace).
2. **Row-level scoping** — every tenant-owned row carries `workspaceId`; every query filters by it.
3. **Postgres RLS policies** enforcing the above in the database.

## Decision

Use **row-level scoping (option 2)** as the primary mechanism, with defense in depth:

- Every tenant-owned table has a non-null `workspaceId` column, indexed, and included in relevant composite indexes and unique constraints.
- All data access goes through `lib/repositories/*`. Repository functions take an explicit `{ workspaceId, actorId }` context and always add `where: { workspaceId }`. Direct `prisma.*` calls outside repositories are disallowed by lint rule + review.
- A single `authorize(actor, action, resource)` helper (`lib/authz.ts`) checks role (`owner | admin | member | guest`) and project-level overrides before any mutation.
- Cross-workspace isolation tests are mandatory for every new resource: two seeded workspaces, assert neither can read or mutate the other's rows by id.
- Postgres **RLS is deferred** to M12 hardening as an additional layer, not the primary guarantee (it complicates migrations and the ORM path; revisit with security testing).

Guest access is project-scoped: a guest membership grants read/comment on specific projects only, never workspace-wide listing.

## Consequences

**Positive:** simple migrations and pooling; one connection; straightforward analytics across the fleet (internal only); cheap to run for small teams.

**Negative:** a missing `where: { workspaceId }` is a cross-tenant leak — mitigated by the repository boundary, lint rule, mandatory isolation tests, and (M12) RLS. Noisy-neighbor performance is possible at scale — mitigated by per-workspace rate limits (M02) and quotas (M06), and revisited in M15 scale validation.

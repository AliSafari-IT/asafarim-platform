# @asafarim/seed-manager

Typed, allowlisted seed-data providers shared by the Admin Console and
the CLI seed scripts. Server-only — providers open database connections
and read server-only environment variables; nothing here is safe to
import into a client component.

## What's here

- **Contracts** (`contracts.ts`) — `SeedProvider`,
  `SeedDefinition`, `SeedResult`, and related types that every
  provider implements.
- **Registry** (`registry.ts`) — `SeedRegistry` that maps seed names
  to providers, with `getProvider()`, `listSeeds()`, and
  `isAvailable()`.
- **Safety** (`safety.ts`) — environment guards, dry-run mode,
  redaction of sensitive fields in output, and refusal to seed against
  a non-empty database unless `--force` is passed.
- **Checksums** (`checksums.ts`) — deterministic checksums for seed
  definitions so the Admin Console can detect drift between what was
  seeded and what's defined.
- **Environments** (`environments.ts`) — environment-aware seed
  selection (dev/staging/prod).
- **SQL helpers** (`sql.ts`) — safe, parameterized SQL utilities for
  providers that need raw SQL.
- **Prisma client** (`prisma-client.ts`) — `createPrismaClient()`
  and `withPrisma()` for providers that need a dedicated Prisma
  connection.
- **Definitions** — `foundation` (roles, permissions, initial admin),
  `edumatch` (students, tutors, booking chain), `timelineai` (demo
  author + 8 demo timelines).
- **Providers** — `platform-foundation`, `edumatch`, `timelineai`,
  `testora`, `appbuilder`, and `unavailable` (placeholder for seeds
  that don't exist yet).

## Exports

```ts
import {
  seedFoundation,
  seedEdumatch,
  seedTimelineai,
  SeedRegistry,
  type SeedProvider,
} from "@asafarim/seed-manager";
```

## Scripts

```bash
pnpm --filter @asafarim/seed-manager typecheck
pnpm --filter @asafarim/seed-manager test          # vitest
```

## Usage

The CLI seed scripts in `packages/db/prisma/` are thin wrappers over
these providers, so the Admin Console's seed-data panel and the command
line can never drift apart.

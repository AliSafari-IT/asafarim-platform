# ADR-0001 — Dedicated TasksAI PostgreSQL database

**Status:** Accepted (M00) · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM
**Deciders:** platform maintainer · **Supersedes:** none

## Context

The ASafarIM platform runs a shared Prisma schema (`packages/db`) for users, RBAC, audit, and several verticals. Two isolated apps (Testora, AppBuilder) use their own Drizzle databases; JobMatch uses its own **Prisma** schema and Postgres with the client generated into the app so it cannot collide with the platform client.

TasksAI introduces a large, fast-moving multi-tenant work graph (workspaces, projects, tasks, hierarchy, dependency edges, events, outbox). Putting this in the shared schema would couple TasksAI's migration cadence to every other app and risk cross-vertical schema conflicts.

## Decision

TasksAI uses a **dedicated PostgreSQL database** and its **own Prisma schema**, following the JobMatch pattern:

- Connection: `TASKSAI_DATABASE_URL` (local: `postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai`).
- Schema: `apps/tasks-ai/prisma/schema.prisma`.
- Client generated to `apps/tasks-ai/lib/db/generated` (never the platform client).
- Local infra: a `tasksai-postgres` service on port **55438** in the local compose file.
- Migrations: `pnpm --filter @asafarim/tasks-ai db:migrate` / `db:migrate:deploy`, run only against `TASKSAI_DATABASE_URL`.
- TasksAI stores an **opaque platform user id** (string) for identity. It never copies the platform `User` table, credentials, or profile data. Display data for users is fetched at render time or denormalized minimally (name/avatar) with a documented refresh path.

## Consequences

**Positive:** independent migration cadence; no cross-vertical schema conflict; blast radius of a bad migration is TasksAI only; clean backup/restore and retention boundary for GDPR.

**Negative:** one more Postgres instance to run, back up, and monitor; cross-database joins to platform data are impossible by design (must go through the platform, an API, or accepted denormalization); developers must remember which `DATABASE_URL` a command targets.

**Mitigations:** `lib/env.ts` validates `TASKSAI_DATABASE_URL` is present and is *not* equal to the platform `DATABASE_URL`; migration scripts refuse to run if the target looks like the platform DB.

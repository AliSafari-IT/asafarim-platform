# ADR-0003 — API-first `/api/v1` boundary

**Status:** Accepted (M00) · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

## Context

TasksAI will have a web UI, a background worker, automations (M09), integrations (GitHub, M09), an eventual MCP surface (M09+), and third-party API clients (M09/M15). If the UI talks to bespoke server actions while everything else uses a separate API, the two drift and the contract is untested.

## Decision

There is **one versioned contract**: `/api/v1/*`, REST, and the web UI consumes it like any other client.

- Routes under `apps/tasks-ai/app/api/v1/*` (Next.js route handlers).
- Request/response shapes are Zod schemas in `lib/api/schemas/*`, shared by server and typed client.
- **OpenAPI 3.1** document generated from the Zod schemas, served at `/api/v1/openapi.json` and checked into `docs/api/openapi.json` in CI (drift fails the build).
- Conventions: cursor pagination (`?cursor=&limit=`), stable machine error codes (`{ error: { code, message, details? } }`), optimistic concurrency via `If-Match` / `version` precondition (409 on mismatch), `Idempotency-Key` header on POST (dedupe window persisted), per-actor + per-workspace rate limits (429 with `Retry-After`).
- **Version policy** ([docs/api/versioning.md](../api/versioning.md), authored in M02): additive changes only within `v1`; breaking changes require `v2` and a deprecation window of ≥180 days with `Deprecation` / `Sunset` headers.
- Thin Next.js server actions are permitted only as pass-throughs to `/api/v1` for form ergonomics; they contain no business logic.

## Consequences

**Positive:** one contract, one set of contract tests, one source of client types; automations/integrations/MCP are first-class from the start; external API in M09 is mostly hardening, not new design.

**Negative:** more upfront ceremony than server actions; every UI feature needs an endpoint + schema. Accepted — it is the point. Some latency-sensitive reads may later need edge caching or a BFF; revisit in M11 performance work.

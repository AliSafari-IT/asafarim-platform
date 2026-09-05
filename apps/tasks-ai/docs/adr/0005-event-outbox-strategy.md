# ADR-0005 — Transactional activity + outbox events

**Status:** Accepted (M00) · **Date:** 2026-09-06 · **Owner:** Ali Safari / ASafarIM

## Context

TasksAI needs: an immutable per-entity **activity history** (UI timeline), an **audit trail** (security/compliance), and reliable **side effects** (notifications, digests, search indexing, webhooks in M09, integration sync). Firing side effects inline with the request is unreliable (partial failure) and slow; firing them from application code after commit risks lost events on crash.

## Decision

Use the **transactional outbox** pattern with three event tables in the TasksAI database:

- **`ActivityEvent`** — human-facing, per-entity ("Ana changed status to Done"). Rendered in timelines. Append-only.
- **`AuditEvent`** — security-facing (auth, permission changes, exports, AI applies, admin actions, break-glass). Append-only, stricter retention.
- **`OutboxEvent`** — machine-facing work items (`type`, `payload`, `status`, `attempts`, `availableAt`, `dedupeKey`). Drives notifications, digests, search indexing, and (M09) webhooks/integrations.

Rules:

1. Every mutating service method writes the domain row(s) **and** the corresponding `ActivityEvent` / `AuditEvent` / `OutboxEvent` rows inside **one `prisma.$transaction`**. If the transaction fails, no event is emitted.
2. A worker (BullMQ, [ADR-0001] infra) polls `OutboxEvent` where `status = 'pending' AND availableAt <= now()`, processes with at-least-once semantics, and marks `done` / `failed` with exponential backoff and a dead-letter state after N attempts.
3. Consumers are **idempotent** and key off `OutboxEvent.id` or `dedupeKey` (e.g. notification coalescing, "don't index twice").
4. Event `type` strings and payload shapes come from [research/event-taxonomy.md](../research/event-taxonomy.md); payloads are versioned (`v` field); unknown future versions are skipped, not crashed.
5. Reconciliation test (M02 exit): for a scripted set of domain changes, the produced `AuditEvent` + `OutboxEvent` rows match an expected manifest exactly.

## Consequences

**Positive:** no lost side effects across crashes; fast requests; one mechanism for timeline, audit, notifications, search, and webhooks; clean replay (M12) by re-enqueuing outbox rows.

**Negative:** every mutation path must remember to emit events — mitigated by funnelling all writes through `lib/services/*` and a reconciliation test. Outbox table growth needs archiving (retention job, M12). Polling adds small latency vs. push — acceptable; can add `LISTEN/NOTIFY` later if needed.

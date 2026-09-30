# TasksAI technical product charter

This public charter defines the implemented product and engineering contract.
Commercial positioning, pricing hypotheses, customer-discovery plans, and
internal go/no-go records are intentionally outside this repository.

## Product contract

TasksAI is a multi-tenant work-execution application built around projects,
tasks, collaboration, capture, search, automations, and proposal-only AI. The
non-AI task-management core remains usable when AI providers are unavailable.

## Technical scope

- Dedicated TasksAI database and tenant-scoped authorization.
- Versioned API resources with stable error envelopes and pagination.
- Fast task capture, planning views, collaboration, notifications, import,
  export, and portability.
- Provider-neutral AI boundary with quotas, cost accounting, a kill switch,
  fixture-backed tests, citations, and reviewable proposal diffs.
- Rules and automations, scoped API tokens, webhooks, goals, cycles, time, and
  portfolio analytics.
- PWA behavior, accessibility, localization, security, privacy, reliability,
  and administrative controls.

## Explicit exclusions

The product does not autonomously allocate work, score or rank employees,
perform emotion or keystroke analysis, make employment decisions, or let AI
silently send messages, delete records, or assign people. AI output is always
a proposal that a person reviews and applies.

## Architecture decisions

The app uses an isolated database, a tenant model enforced at repository and
API boundaries, a versioned API-first contract, proposal-only AI, and a
transactional event outbox. The corresponding ADRs in `docs/adr/` are the
normative records.

## Instrumentation and compliance

The public event taxonomy and telemetry dictionary define what is measured.
Individual surveillance metrics are prohibited. Security and privacy behavior
is documented in `security-privacy.md` and `compliance/decisions.md`.

# TasksAI — Milestone Implementation Plan (M00–M15)

**Plan date:** 6 September 2026
**App:** `apps/tasks-ai` · package `@asafarim/tasks-ai` · dev port **3013** · domain `tasks-ai.asafarim.com`
**Dedicated DB:** `TASKSAI_DATABASE_URL=postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai` (already in `.env.local`)
**Public URL var:** `NEXT_PUBLIC_TASKSAI_URL=http://localhost:3013` (already in `.env.local`)

## How this plan is executed

- **One milestone = one branch = one PR.** Branch names: `tasksai/m00-charter`, `tasksai/m01-foundation`, … `tasksai/m15-enterprise`.
- Branches are **stacked**: each milestone branches from the previous milestone's branch (not `main`) so review can proceed in parallel without waiting for merges. When an earlier PR merges to `main`, rebase the open stack onto `main`.
- Every PR: green CI (`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`), a filled-in PR description mapping work to the milestone's **Exit evidence** bullets, and a checkbox list of that milestone's scope items.
- No milestone claims production/launch status in UI copy, Showcase, or marketing until M14. Showcase entry stays `planned` → `beta` only at M13 → `live` only at M14.
- DB isolation rule (matches JobMatch): TasksAI uses its **own Prisma schema and client** generated to `apps/tasks-ai/lib/db/generated`, its **own Postgres** on `55438`. It stores an **opaque platform user id** only — never a copy of the platform user table. Never point TasksAI migrations at the platform DB.

## Decisions locked before M01 (carried from M00)

| Topic | Default assumption (confirm in M00 PR) |
|---|---|
| ORM | Prisma (isolated), mirrors JobMatch |
| Tenant model | Row-level `workspaceId` scoping on every table + every query; single shared DB, no schema-per-tenant |
| API boundary | API-first: `/api/v1/*` REST + OpenAPI; UI consumes the same contract |
| AI mutation model | Proposal/preview only — every AI change requires explicit user confirmation, produces an audit record + undo plan |
| Event strategy | Transactional `ActivityEvent` + `OutboxEvent` written in the same DB transaction as the domain change; worker drains the outbox |
| Realtime | SSE-first (no websocket infra) |
| Provider posture | Server-only AI adapters, no-training providers, fixture provider for CI |
| License | Source-available; **commercial license gate before M14** billing |

---

## M00 — Product charter, validation, and commercial gate

**Branch:** `tasksai/m00-charter` · **PR title:** `docs(tasksai): M00 product charter, ADRs, KPI + event taxonomy`
**Nature:** Documentation only. No app code.

**Deliverables (all under `apps/tasks-ai/docs/`):**
- `charter.md` — ICP, jobs-to-be-done, positioning, MVP boundaries, non-goals, pricing hypotheses.
- `research/interview-plan.md` + `research/synthesis-template.md` — 15-interview plan, 3–5 design-partner recruitment, consent/beta-terms outline.
- `research/kpi-dictionary.md` — activation, TTFV, weekly successful teams, completion, overdue spillover, AI acceptance/edit-distance, retention, reliability, cost, support load — each with definition, source event, owner.
- `research/event-taxonomy.md` — canonical event names, payload shapes, versioning rule (feeds `ActivityEvent`/`OutboxEvent` in M02).
- `compliance/decisions.md` — license path, operating entity, GDPR roles (controller/processor), AI Act classification assumption, subprocessor list, data-residency intent, retention schedule stub — each with a named owner.
- `adr/0001-dedicated-database.md`, `adr/0002-tenant-model.md`, `adr/0003-api-first-boundary.md`, `adr/0004-ai-proposal-model.md`, `adr/0005-event-outbox-strategy.md`.
- `risk-register.md` — trademark/naming risk, license gate, AI cost, surveillance-misuse risk, scope creep.
- `charter-signoff.md` — go/no-go checklist for M01.

**Exit evidence:** signed charter doc; interview synthesis template ready; design-partner commitment tracker; risk register; approved KPI + event taxonomy; license/compliance decisions each with an owner; explicit **go for M01**.

**Non-goals:** no feature code, no schema, no production claims.

---

## M01 — Platform foundation and production-like delivery

**Branch:** `tasksai/m01-foundation` · **PR title:** `feat(tasksai): M01 app scaffold, dedicated DB, worker skeleton, CI + test harnesses`
**Depends on:** M00 sign-off.

**Deliverables:**
- **Scaffold `apps/tasks-ai`** (mirror `apps/jobmatch` + `apps/timelineai`): Next.js 16 App Router, TS 5.7, Tailwind 4, React 19, Turbopack, `output: 'standalone'`.
  - `app/layout.tsx`, `app/page.tsx` (public landing), `app/(workspace)/…` authenticated shell using `@asafarim/ui` `AppShell`, responsive nav, `data-app="tasks-ai"` theming token block in `@asafarim/ui`.
  - `app/api/health/route.ts` (web) + worker health probe; `lib/health.ts`, `lib/env.ts` (zod-validated env: `TASKSAI_DATABASE_URL`, `AUTH_SECRET`, `REDIS_URL`, `NEXT_PUBLIC_TASKSAI_URL`), `lib/env.test.ts`.
  - Honest Showcase disclosure: keep `planned` entry; landing page carries a "not yet launched" note.
- **Registry wiring:**
  - `packages/auth` platform app registry: add `tasksai` entry (id, name, url from `NEXT_PUBLIC_TASKSAI_URL`, icon).
  - Add `tasks-ai` to trusted SSO origins / cookie-domain allowlist and any URL registry in `packages/auth` / `packages/config`.
  - `proxy.ts` (auth route proxy) copied from jobmatch; unauthenticated → Hub sign-in, back to TasksAI.
- **Database boundary:**
  - `apps/tasks-ai/prisma/schema.prisma` with `generator client { output = "../lib/db/generated" }`, `datasource db { url = env("TASKSAI_DATABASE_URL") }`. M01 schema is minimal: `WorkspacePlaceholder`/`HealthCheck` only (real graph lands M02) — or an empty baseline migration.
  - `apps/tasks-ai/prisma.config.ts`; root `package.json` scripts `--filter @asafarim/tasks-ai db:generate|db:migrate`.
  - `docker-compose` local infra: add `tasksai-postgres` service on `55438` (user/db `tasksai`).
  - Migration + rollback rehearsal script under `apps/tasks-ai/scripts/`.
- **Worker skeleton:** `apps/tasks-ai/worker/` BullMQ + Redis, `worker:dev` turbo task, no real jobs yet (a `noop`/health job), structured redacted logging (`lib/observability/`), baseline metrics + trace hooks.
- **Delivery / infra:**
  - `apps/tasks-ai/Dockerfile` multi-stage (web) + worker stage; `infra` Compose service entries; Caddy route plan noted in `docs/deploy-plan.md` (no prod deploy yet).
  - CI: extend GitHub Actions / turbo pipeline so `@asafarim/tasks-ai` participates in `lint`/`typecheck`/`build`/`test`; add `db:migrate:deploy` dry-run against an ephemeral Postgres.
- **Test harnesses:** Vitest unit + integration (`vitest.config.ts`, server-only stub), Playwright (`playwright.config.ts`, `e2e/`), accessibility check harness (axe), migration test, deterministic seed fixtures (`apps/tasks-ai/fixtures/`, `prisma/seed.ts`).

**Exit evidence:** CI green; staging-equivalent smoke passes; SSO round trip (Hub → TasksAI → workspace) works; migrate + rollback rehearsal passes; web + worker health observable; secrets absent from logs and client bundles (bundle scan test).

---

## M02 — Multi-tenant work graph and versioned API

**Branch:** `tasksai/m02-work-graph` · **PR title:** `feat(tasksai): M02 multi-tenant domain model + /api/v1 with OpenAPI`
**Depends on:** M01.

**Deliverables:**
- **Prisma models:** `Workspace`, `Membership`, `Team`, `Project`, `Goal`, `Cycle`, `Task`, self-referential task hierarchy (`parentId` + closure or path), `Relationship`/`DependencyEdge` (blocks/relates/duplicates), `Status`, `Label`, `CustomFieldDef` + `CustomFieldValue`, `SavedView`, `ActivityEvent`, `AuditEvent`, `OutboxEvent`. Every tenant-scoped table carries `workspaceId` + `deletedAt` (soft archive).
- **RBAC:** roles `owner | admin | member | guest`; project-level permission overrides; a single `authorize(actor, action, resource)` helper; **every** repository query takes `{ workspaceId, actorId }` and filters by it.
- **API `/api/v1`:** REST resource routes under `app/api/v1/*`; generated **OpenAPI** doc (`app/api/v1/openapi/route.ts` or static `openapi.yaml`); typed request/response zod schemas shared with clients; cursor pagination; stable machine error codes (`error.code`); optimistic concurrency via `version`/`updatedAt` precondition; `Idempotency-Key` header support for POST; per-actor request limits; documented API version policy (`docs/api-versioning.md`).
- **Boundaries:** `lib/repositories/*` (data), `lib/services/*` (transactions); each mutating service writes domain row + `ActivityEvent` + `OutboxEvent` in one `prisma.$transaction`. Deterministic fixtures + migration tests.
- **Security tests:** IDOR (guess sibling ids across workspaces), privilege escalation (member → admin actions), concurrent edit → version conflict, idempotent retry (same key → single mutation), cross-workspace isolation (two seeded tenants).

**Exit evidence:** API contract tests pass; two concurrent tenants cannot read/mutate each other; retried mutations never duplicate; audit + outbox reconcile with domain changes; seeded demo runs end-to-end through the API only.

---

## M03 — Fast task experience and planning views

**Branch:** `tasksai/m03-task-ux` · **PR title:** `feat(tasksai): M03 task workflows + list/board/calendar/timeline views`
**Depends on:** M02.

**Deliverables:**
- Workspace onboarding wizard; project creation; task detail panel; subtasks; dependencies UI; estimates; start/due dates; assignees; labels; custom fields; recurrence rules; task templates; bulk actions.
- Views: **Inbox**, **My Work**, **List**, **Board**, **Calendar**, **Timeline** — all backed by one `SavedView` + filter model (query AST → API params).
- Interaction: command palette (⌘K), quick capture, inline editing, drag/drop with keyboard-accessible move alternatives, optimistic updates, undo for reversible actions, autosave status indicator, explicit empty/error states.
- Responsive mobile + tablet layouts from day one; deep links + browser back/forward preserved (URL-encoded view state).
- Instrumentation: time-to-first-project, time-to-first-task, completion rate, overdue work, per-view render performance; p95 CRUD latency measured in CI perf check.

**Exit evidence:** a signed-in user creates a project, captures/organizes tasks, models dependencies, plans across all views, and closes work — **no AI**. Critical Playwright journeys + WCAG keyboard checks pass. p95 CRUD target recorded.

---

## M04 — Collaboration, realtime, and notifications

**Branch:** `tasksai/m04-collaboration` · **PR title:** `feat(tasksai): M04 invitations, comments/mentions, SSE realtime, notifications`
**Depends on:** M03; attachment security decision from M00.

**Deliverables:**
- Invitations + membership lifecycle (invite/accept/revoke/expire), owner transfer, guest accounts, project visibility levels; assignees, watchers; comments, @mentions, reactions, attachments; immutable activity history view.
- Notification inbox (in-app) + configurable email digests: dedup, quiet hours, unsubscribe tokens, delivery audit log.
- Presence + near-realtime via **SSE** (`app/api/v1/streams/*`); stale writes resolved with version-conflict prompts, never silent overwrite; reconnect/backfill logic.
- Attachments: private object storage (`@asafarim/storage`), MIME + size validation, malware-quarantine decision recorded + enforced, signed time-limited download routes, ownership checks, retention + deletion hooks.
- Abuse/security tests: role escalation, invitation replay, tenant leakage via shared links, mention-spam throttle, notification-storm coalescing, concurrent editing conflict.

**Exit evidence:** a 3-person team invites, assigns, discusses, attaches, observes live changes, and hands off work; permissions + notification prefs enforced; reconnect + conflict tests pass.

---

## M05 — Capture, search, import, and portability

**Branch:** `tasksai/m05-portability` · **PR title:** `feat(tasksai): M05 global search, inbound capture, CSV/JSON import-export`
**Depends on:** M03–M04.

**Deliverables:**
- Global search across authorized projects, tasks, comments, labels, people, dates — keyword + structured filters; saved searches; recent-search history; Postgres FTS (tsvector) or trigram, scoped by authorization.
- Universal inbox sources: web quick-capture endpoint + unique per-workspace inbound email address; provenance stored; spoof/replay protection (signed tokens, dedup on message-id).
- Deterministic CSV + JSON import/export: dry-run validation, field mapping UI, duplicate detection, downloadable error report, resumable jobs (worker), idempotent re-run.
- One evidence-led migration adapter — pick the single source with strongest design-partner demand from M00; do not build speculative importers.
- Workspace data export + deletion manifest; CSV export hardened against formula injection (`=,+,-,@` prefixing).

**Exit evidence:** seeded records found within agreed relevance/latency; imports previewable + idempotent; exports round-trip core entities; hostile/malformed files fail safely; search never returns unauthorized content.

---

## M06 — AI safety, evaluation, and provider boundary

**Branch:** `tasksai/m06-ai-boundary` · **PR title:** `feat(tasksai): M06 provider-neutral AI subsystem, evals, kill switch`
**Depends on:** M02, M05, M00 privacy/AI classification.

**Deliverables:**
- `lib/ai/` server-only: provider adapter interface, **fake fixture provider** (deterministic, used in CI — zero billable calls), prompt + model registry with versions, AI job state machine, usage ledger, per-workspace quotas, cache keys, retry policy, degraded/offline mode.
- Tenant-context retrieval: least-data prompt assembly, PII/secret redaction pass, prompt-injection isolation (untrusted content fenced + never interpreted as instructions), content boundaries, cancellation, retention controls, no-training provider requirement documented.
- Allowed proposal operations enumerated with blast-radius limits; every AI mutation stays a preview needing confirmation → produces `AuditEvent` + undo plan.
- Versioned **offline eval suite** (`apps/tasks-ai/evals/`): extraction, decomposition, prioritization, evidence grounding, multilingual input, adversarial content, consistency, latency, cost — with thresholds + a report artifact.
- Quality + spend dashboards; per-workspace budgets; global kill switch; incident playbook (`docs/ai-incident-playbook.md`).

**Exit evidence:** fixture mode runs in CI with no billable calls; chosen provider passes quality/safety/latency/cost gates; prompt injection cannot widen data access or operation scope; disabling AI leaves core task management fully functional.

---

## M07 — AI copilot from intent to approved plan

**Branch:** `tasksai/m07-copilot` · **PR title:** `feat(tasksai): M07 intent-to-plan copilot with audited proposal diffs`
**Depends on:** M06 + stable M03 workflows.

**Deliverables:**
- Convert pasted notes / messages / briefs / meeting text → draft projects, tasks, owners, dates, dependencies, risks, open questions — each with **source citations** + confidence score.
- Task decomposition, acceptance-criteria drafting, duplicate suggestions, project-brief generation, thread summaries, natural-language query/command in the palette.
- Proposal diff UI grouped by create / update / link; actions: edit, partial accept, reject, regenerate, undo, typed feedback.
- Hard guardrails: never auto-send messages, delete records, assign people, or change committed dates; sensitive / high-blast-radius changes require elevated confirmation.
- Metrics: proposal acceptance, edit distance, time saved, correction reasons, hallucination rate, cost, trust rating.

**Exit evidence:** a design-partner brief becomes an approved work graph through a fully audited flow; every generated fact links to evidence or is flagged as an assumption; rejected proposals change nothing; accepted proposals are idempotent + undoable.

---

## M08 — Focus, risk, and workload intelligence

**Branch:** `tasksai/m08-intelligence` · **PR title:** `feat(tasksai): M08 explainable focus ranking + risk/workload briefs`
**Depends on:** M07 + sufficient activity history from M04.

**Deliverables:**
- Explainable focus ranking from explicit signals: urgency, impact, dependencies, commitments, user preferences, workload — every factor shown, per-user overrides.
- Generated views: personal daily brief, team project pulse, blocker chains, due-date risk, stale-work prompts, workload imbalance, "what changed" summaries.
- Deterministic signals separated from model judgments in the UI; show confidence, freshness, evidence, limitations, alternative actions.
- User controls: tune or disable individual signals, correct source data, typed feedback tied to rule/model version.
- Evaluation: false-alarm rate, missed risks, ranking stability, multilingual quality, fairness proxies, cost, alert fatigue.

**Exit evidence:** suggestions meet approved offline + design-partner thresholds; every suggestion reproducible from versioned evidence; feature cannot be used to infer personality, emotion, productivity scores, or automated performance decisions (explicit guard + tests).

---

## M09 — Rules, automations, and integration platform

**Branch:** `tasksai/m09-automations` · **PR title:** `feat(tasksai): M09 trigger-condition-action rules engine + API tokens/webhooks + first integrations`
**Depends on:** M02, M04, M06, M05 portability.

**Deliverables:**
- Rules engine: trigger → condition → action, with dry run, preview, activation, execution log, retries, dedup, rate limits, failure queue, pause, rollback guidance. Runs on the worker.
- Developer platform: scoped API tokens or OAuth clients, webhook endpoints with signed deliveries, replay protection, secret rotation, granular scopes, developer docs.
- First integrations — pick from calendar / email / Slack-Teams / GitHub by design-partner evidence; define sync ownership + conflict behavior **before** any write path.
- MCP-compatible surface only after `/api/v1` is stable: start read-only, then narrow write tools with confirmation + audit.
- Metering by workspace for automation + AI usage; loop / fan-out-storm / cross-tenant-flow prevention.

**Exit evidence:** a user can build, test, observe, pause, repair an automation safely; webhook contract tests + integration sandboxes pass; revoked credentials stop access immediately; automation retries never duplicate work.

---

## M10 — Goals, cycles, time, and portfolio analytics

**Branch:** `tasksai/m10-analytics` · **PR title:** `feat(tasksai): M10 goals/OKRs, cycles, time tracking, portfolio dashboards + forecasting`
**Depends on:** M03–M04 + M08.

**Deliverables:**
- Goals/outcomes, measurable key results, project health, milestones, cycles/sprints, capacity, estimates, time entries, budgets, task↔goal linkage.
- Dashboards (individual + team): flow, cycle time, throughput, aging work, predictability, blocked time, workload, goal progress.
- Portfolio views + **versioned forecasting** with confidence ranges, stated assumptions, source freshness, drill-down to underlying tasks.
- Historical snapshots preserved when metric definitions change; metric filters + exports; documented metric semantics (`docs/metric-semantics.md`).
- Explicit prohibitions enforced: no opaque employee rankings, emotion analysis, keystroke monitoring, automated employment decisions.

**Exit evidence:** a manager traces portfolio health → projects → tasks; metric calculations reconcile with fixtures; forecast backtests + limitations published; every chart has a "how this was computed" explanation.

---

## M11 — PWA, accessibility, localization, and performance

**Branch:** `tasksai/m11-pwa-a11y-i18n-perf` · **PR title:** `feat(tasksai): M11 WCAG 2.2 AA, installable PWA + offline queue, en/nl/fr, perf budgets`
**Depends on:** stable M03–M10.

**Deliverables:**
- WCAG 2.2 AA for critical journeys: keyboard, screen-reader, focus management, contrast, reduced-motion, 200% zoom, drag/drop alternatives, accessible data-viz.
- Installable PWA: service worker, resilient drafts, safe read caching, offline **mutation queue** for explicitly supported actions, reconnect conflict handling, visible sync state.
- Copy externalized via `@asafarim/shared-i18n`; launch **en / nl / fr** UI foundations; locale-aware dates, time zones, week starts, number formats, notification schedules.
- Route-level budgets for JS, images, queries, web vitals; virtualized large work lists; DB hotspot profiling + fixes.
- Test matrix: current evergreen browsers + representative mobile/tablet viewports.

**Exit evidence:** independent a11y review has no unresolved critical issues; critical journeys work at 200% zoom keyboard-only; offline/reconnect tests lose/duplicate nothing; production-like perf budgets pass in CI.

---

## M12 — Security, privacy, admin, and reliability

**Branch:** `tasksai/m12-security-privacy-admin` · **PR title:** `feat(tasksai): M12 threat model, workspace admin, hardening, DR exercises`
**Depends on:** M06, M09–M11.

**Deliverables:**
- Threat model, data-flow map, processing register, DPIA decision, AI system inventory, DPA/subprocessor/SCC package, retention schedule, data-subject (DSAR/export/deletion) workflows — all in `docs/compliance/`.
- Workspace administration: audit search + export, usage + budget controls, domain controls, session/token revocation, abuse reporting, support tooling, break-glass procedure.
- Hardening: security headers, CSP, dependency audit, secret handling, queue security, upload scanning, webhook verification, tenant authorization review, rate limits, privileged-op protections; commission scoped external security testing.
- Ops: SLOs, on-call ownership, alerts, status comms, incident response, AI/provider-outage behavior, source/integration takedown process.
- Reliability exercises: backup, point-in-time restore, disaster recovery, queue replay, deletion verification, rollback — with recorded RPO/RTO.

**Exit evidence:** no unresolved critical/high findings; restore + incident exercises pass; DSAR/export/deletion verified end-to-end; residual risks accepted by named owners; launch scorecard green.

---

## M13 — Design-partner beta and product-market validation

**Branch:** `tasksai/m13-beta` · **PR title:** `feat(tasksai): M13 beta onboarding, instrumentation, decision report`
**Depends on:** M12 + M00 research protocol.
**Showcase:** flip TasksAI entry `planned` → `beta`.

**Deliverables:**
- Beta onboarding flow under explicit beta terms + consent; concierge-cohort tooling; 5–10 design-partner teams recruited.
- Instrumentation + a metrics dashboard for: activation, TTFV, weekly successful teams, task completion, overdue spillover, invitation/collaboration, AI proposal acceptance + edit distance, retention, reliability, cost, support load — segmented by team type.
- Feedback triage system: severity, source, owner, response SLA, links to product/rule/model changes.
- Research artifacts: observed-onboarding notes, workflow interviews, churn/loss reviews, willingness-to-pay tests.
- `docs/beta-decision-report.md` against pre-approved thresholds → records continue / narrow / remediate / stop.

**Exit evidence:** ≥5 teams complete the study; results + limitations documented; critical trust/reliability issues have owners; launch decision rests on retention + workflow value, not signups.

---

## M14 — Billing, packaging, and public launch

**Branch:** `tasksai/m14-billing-launch` · **PR title:** `feat(tasksai): M14 subscriptions, entitlements, usage transparency, staged launch`
**Depends on:** favorable M13 decision + M12 controls. **Hard gate:** signed commercial license + operating entity.
**Showcase:** flip `beta` → `live` only after launch scorecard passes.

**Deliverables:**
- Legal: commercial licensing + operating-entity resolution; approved terms, privacy notice, DPA, refund/cancellation, tax/VAT, support, service-status policies.
- Packaging: Free / Pro / Business / Enterprise validated; subscriptions, trials, entitlements, metered AI/automation allowances, top-ups, invoices, webhook verification, retries, grace periods, cancellation, refunds (payment provider integration — likely Stripe).
- Usage transparency: customers see limits + cost drivers before overage; budgets enforced without surprise charges; entitlements **fail safe** (deny, not silent allow).
- Launch site, onboarding, lifecycle messaging, docs, support workflow, analytics, referral loop, production runbook.
- Staged rollout: feature flags, capacity tests, rollback criteria, daily launch scorecard.

**Exit evidence:** license gate signed; test + real payment lifecycles reconcile; entitlements fail safe; first paid cohort meets approved conversion / margin / support / retention gates; public claims match measured capability.

---

## M15 — Enterprise readiness and ecosystem expansion

**Branch:** `tasksai/m15-enterprise` · **PR title:** `feat(tasksai): M15 SAML/SCIM, scale validation, integration catalog`
**Depends on:** M14 + demonstrated enterprise demand.

**Deliverables:**
- Enterprise identity: SAML SSO, SCIM provisioning, domain claiming, group sync, granular admin roles, service accounts, IP/session controls, legal hold + configurable retention where justified.
- Assurance: audit streaming, security-questionnaire pack, vendor-risk evidence, data-location options, customer-managed-key feasibility study, SOC 2 / ISO 27001 readiness plan (no premature certification claims).
- Scale validation: large workspaces, portfolios, API clients, automations, realtime fan-out, search, exports, recovery — publish tested limits + fair-use controls.
- Ecosystem: reviewed integration catalog, partner sandbox, OAuth app review, webhook health, API changelog + deprecation policy, SDK priorities.
- Evaluate vertical templates + outcome/usage-based packaging only from customer evidence; employment-impacting AI stays out of scope until separately classified.

**Exit evidence:** ≥1 enterprise pilot passes security + procurement review; isolation + scale tests meet thresholds; admin + offboarding controls exercised; ecosystem governance + support ownership operational.

---

## Cross-cutting conventions (apply to every PR)

- **No native dialogs** — use `@asafarim/ui` `ConfirmDialog`, never `window.confirm/alert`.
- Theme via `data-app="tasks-ai"` + `data-theme` on `<html>`; tokens in `@asafarim/ui/styles/tokens.css`.
- Turbo: shared package changes rebuild `dist/` before `@asafarim/tasks-ai` sees them.
- Env: additions go to `.env`/`.env.production` then re-encrypt with `pnpm env:encrypt:local` (`.env.age` committed).
- Every mutating path writes `ActivityEvent` + `OutboxEvent` in the same transaction (from M02 on).
- Every query is workspace- and actor-scoped; add an isolation test with each new resource.
- AI never mutates without an explicit user-confirmed proposal + audit + undo (from M06 on).

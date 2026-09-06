# TasksAI — Security, privacy, admin & reliability (M12)

The controls package for a supportable service suitable for a controlled
external beta. This document is the register; the code is under
`lib/{security,admin,privacy}` and `next.config.ts`.

## 1. Threat model (STRIDE summary)

| Threat | Control |
|---|---|
| **Spoofing** — forged session / API token / webhook | Platform SSO (JWT); API tokens are `tai_` random, sha256-hash stored, `resolveToken()` denies revoked/expired immediately; webhooks + inbound email + GitHub verified by constant-time HMAC with a replay window. |
| **Tampering** — cross-tenant write, mass edit | Every query scoped by `workspaceId` via `lib/context` + repositories; `authorize()` gate on writes; optimistic-concurrency `version`; AI limited to an operation allowlist (ADR-0004). |
| **Repudiation** | Append-only `AuditEvent`; every privileged op (`apitoken.*`, `breakglass.*`, `member.access_revoked`, `dsr.*`, `ai.kill_switch_toggled`) writes one, searchable + CSV-exportable via `/admin/audit`. |
| **Information disclosure** — PII to a provider, IDOR | AI redaction (`lib/ai/redact`) before any provider call, no-training DPA; opaque platform user id is the only identity fact stored; non-member workspace access returns 404, not 403. |
| **Denial of service** | Fixed-window rate limiter (`lib/security/ratelimit`, `RateCounter`), fails open on DB error; per-rule automation hourly cap + causation-depth loop guard; webhook + outbox dead-letter after N. |
| **Elevation of privilege** | Role rank checks; break-glass is **time-boxed** (`BreakGlassGrant`, self-expiring, owner-only, audited); you cannot revoke yourself or (as admin) an owner. |

Scoped external security testing is commissioned before the beta opens
(**exit gate: no unresolved critical/high**).

## 2. Data-flow & processing register

| Data | Where | Legal basis | Retention |
|---|---|---|---|
| Account link (opaque platform user id) | `Membership.platformUserId` | Contract | Until workspace deletion; archived on member revoke |
| Task / project / comment content | dedicated Postgres (`TASKSAI_DATABASE_URL`) | Contract (workspace owner is joint controller) | Workspace-configurable, default 24 months for activity; then archive |
| Attachments (bytes) | private object storage, EU region | Contract | Retention hook + deletion on DSR |
| Audit / security events | `AuditEvent` | Legal obligation / legitimate interest | 24 months min; security events up to 7 years where required |
| Outbox / webhook deliveries | `OutboxEvent`, `WebhookDelivery` | Contract | 30 days after `done`; dead-letter 90 days |
| AI prompt context (transient) | provider (Anthropic / OpenAI) under DPA, no training | Contract | Not retained by TasksAI; provider per DPA |
| Search history | `SearchHistory` | Legitimate interest | Deleted on DSR; user can clear |

**Controller:** the operating entity (ASafarIM, entity TBD — see
`compliance/decisions.md`). **DPIA decision:** limited-risk AI (proposal-only,
human applies every change); DPIA revisited at M13 and before any feature
that ranks or evaluates people (out of scope, M08 guard enforces).

## 3. AI system inventory

| System | Provider | Data seen | Controls |
|---|---|---|---|
| Copilot (`lib/ai`) | fixture (default) / Anthropic / OpenAI | redacted task text + least-data context | allowlist ops, blast radius, quota, kill switch, usage ledger, evals |
| Focus / signals (`lib/intel`) | none — deterministic | task metadata only | anti-surveillance guard on every payload |
| Analytics (`lib/analytics`) | none — deterministic | task timestamps | anti-surveillance guard; versioned semantics |

## 4. Admin & support controls (`lib/admin`)

- **Audit search + CSV export** — `/workspaces/{slug}/admin/audit[/export]`.
- **Member revocation** — `/admin/members/{id}/revoke`: archives the
  membership *and* revokes every API token that member issued, in one
  transaction. Integration-tested.
- **Break-glass** — `/admin/break-glass`: owner grants time-boxed elevated
  access with a reason + ticket ref; self-expires; every grant/revoke
  audited; `activeBreakGlass` never returns an expired grant.
- **AI budget / kill switch** — from M06 (`/ai/settings`, `/ai/usage`).
- Session/token revocation is immediate (`resolveToken` denies on
  `revokedAt`).

## 5. Data-subject workflows (`lib/privacy/dsr.ts`)

`POST /workspaces/{slug}/privacy/dsr { subjectUserId, kind }` (owner):

- **export** — builds a JSON bundle of the subject's own comments, time
  entries, saved views, search history; state → `completed` with the
  bundle in `manifest`.
- **delete** — removes search history, notifications, saved views,
  proposal + signal feedback, time entries; revokes API tokens; **redacts**
  comments in place (thread integrity), archives the membership. Then
  **re-counts** every category and records `verification.residualNonComment`
  — the request is `completed` only when that is empty (verified deletion).
  Integration-tested end to end.

## 6. Hardening

- **Headers / CSP** — `lib/security/headers` (unit-tested), applied in
  `next.config.ts` for `/:path*`: strict CSP (`object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri 'self'`, `upgrade-insecure-requests`,
  `connect-src` = self + configured provider origins only), HSTS 2y,
  `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`,
  COOP/CORP `same-origin`. `TASKSAI_CSP_REPORT_ONLY=true` for baseline
  gathering.
- **Secrets** — server-only `lib/env`; refuses a DB URL equal to the
  platform's; redacting logger.
- **Uploads** — attachment `scanState` gate (M04); type/size checks;
  signed download routes; no proxying bytes.
- **Rate limits** — `lib/security/ratelimit` on privileged ops + write
  bursts; hourly counter prune in the worker.

## 7. SLOs & incident response

| SLO | Target |
|---|---|
| Core `/api/v1` availability | 99.5% / month |
| p95 task CRUD | ≤ 400 ms |
| Worker outbox lag | ≤ 60 s |

Incident response: on-call owner = Ali Safari / ASafarIM. AI-specific
incidents → `docs/ai-incident-playbook.md` (kill switch, budget freeze).
Provider outage → auto-degrade to fixture (M06). Source/integration
takedown → revoke the `Integration` row + its secret; disable the webhook
endpoint.

## 8. Reliability / DR

| Exercise | Method | Evidence |
|---|---|---|
| Backup | nightly `pg_dump` of the dedicated DB + object-storage lifecycle | backup log |
| PITR | WAL archiving on the managed Postgres; **RPO ≤ 5 min**, **RTO ≤ 2 h** (to be measured on the first staging cut) | restore-drill record |
| Migration rollback | `scripts/migrate-rehearsal.sh` (apply → drift-check → rollback → re-apply) | CI + manual run |
| Queue replay | re-enqueue `OutboxEvent` / `WebhookDelivery` rows from `dead` → `pending` | runbook |
| Deletion verification | the DSR `verification` block (see §5) | audit + DSR row |

**Not done in M12** (tracked for the staging cut): commissioned pen test,
measured RPO/RTO from a real restore, `axe` CI sweep, and the signed
DPA/SCC package with each subprocessor.

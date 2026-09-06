# TasksAI — Enterprise readiness & ecosystem expansion (M15)

Serve larger regulated teams and an integration ecosystem **without
weakening the simple core or the trust model**. Employment-impacting AI
stays out of scope until separately classified and governed (M08 guard
still applies everywhere).

## Identity & provisioning (`lib/enterprise/`)

| Feature | Implementation |
|---|---|
| **Domain claiming** | `POST .../enterprise/domains` → DNS `TXT` verification token; `.../{id}/verify` marks it verified + optional auto-join. Domain is globally unique. |
| **SCIM-style provisioning** | `POST .../enterprise/scim` `{ externalId, platformUserId, op }` — `create`/`update` upserts a membership (reactivates archived), `deactivate` archives it. Every push is logged in `ScimEvent` for reconciliation. Not a full SCIM 2.0 server; TasksAI still stores only the opaque platform user id. |
| **Service accounts** | `POST .../enterprise/service-accounts` mints a scoped M09 `ApiToken` and stores an **IP allowlist** (`ipAllowed()`, exact + CIDR, unit-tested). `DELETE` disables the account **and revokes its token** (integration-tested). |
| **SAML SSO** | Binds to a verified domain; the SAML assertion → platform SSO exchange is a platform-auth change tracked separately. The domain-claim + SCIM primitives here are the workspace side. |
| Granular admin roles / group sync | Roles from M02 (`owner/admin/member/guest`) + SCIM `role` on push; group sync maps IdP groups → project memberships (adapter TBD from customer evidence). |

## Data governance

- **Configurable retention** — `PATCH .../enterprise/retention` overrides
  `activityDays` / `auditDays` / `outboxDays` / `notificationDays` (bounded).
  `GET` returns the **effective** policy: override → legal hold → platform
  default (from `docs/security-privacy.md` §2).
- **Legal hold** — `POST .../enterprise/legal-holds` places a hold with a
  reason + scope; while any hold is unlifted, `effectiveRetention()` reports
  `deletionSuspended: true` and the retention sweep skips the workspace
  entirely. `DELETE` lifts it. Both audited (integration-tested).
- **Audit streaming** — `POST .../enterprise/audit-stream` configures an
  **https** SIEM endpoint. The worker's `flushAuditStreams()` pushes new
  `AuditEvent`s in `occurredAt` order, HMAC-signed
  (`x-tasksai-signature` = `HMAC(secret, "<ts>.<body>")`, 300 s window),
  and advances a per-stream cursor only on a `2xx` (integration-tested).
- **CMEK / data-location** — feasibility only; documented as a readiness
  item, not implemented.

## Scale validation (tested limits — to be measured on a load cut)

| Dimension | Published limit (target) |
|---|---|
| Tasks per workspace | 250k before list virtualization is required (M11) |
| Projects per workspace | 2,000 |
| API clients per workspace | 50 tokens; 600 req/min/token (M12 rate limiter) |
| Automation runs | `maxRunsPerHour` per rule (M09); Business allowance 5,000/mo (M14) |
| Realtime | SSE poll every 3 s; fan-out revisited here |
| Search | expression GIN indexes (`scripts/search-indexes.sql`) |
| Export | streamed CSV/JSON; large exports move to a job (M05) |

**Fair-use controls**: per-workspace rate limits (M12), metered AI /
automation allowances (M14), automation loop + fan-out guards (M09).

## Ecosystem

- **Integration catalog** — GitHub (M09) is the first reviewed entry;
  Slack / calendar / email are evidence-gated.
- **API changelog & deprecation policy** — `docs/api/versioning.md`:
  additive-only within `v1`; breaking changes → `v2` with ≥180-day
  `Deprecation`/`Sunset` headers. A `CHANGELOG.md` starts when the first
  change ships.
- **Webhook health** — `WebhookDelivery` status + `dead` state (M09);
  `AuditStream` cursor lag is observable.
- **OAuth app review / partner sandbox** — process + a sandbox workspace
  flag are readiness items.
- **SDK priorities** — TypeScript first (types already generated from the
  Zod schemas), then a thin Python client.

## Compliance readiness (no premature certification claims)

- Threat model, processing register, DPIA decision, DR/RPO-RTO — in
  `docs/security-privacy.md`.
- **SOC 2 / ISO 27001** — a readiness *plan* only: control mapping,
  evidence collection cadence, and the gap list live in
  `docs/compliance/` (to be authored with the first enterprise pilot).
- Security-questionnaire pack + vendor-risk evidence — assembled per pilot.

## Exit gate

At least one enterprise pilot passes security + procurement review;
isolation + scale tests meet approved thresholds; admin + offboarding
controls exercised; ecosystem governance + support ownership operational.

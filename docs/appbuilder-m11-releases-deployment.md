# M11 — Immutable Releases, Deployment, and Production Routing

M11 is the path from "validated app" (M10) to a live production URL, entirely
through the existing controlled metadata runtime — there is no per-app
container, repository, or arbitrary code execution anywhere in this
milestone. A generated app in production is rendered by the exact same
`@asafarim/appbuilder-runtime` renderer that already serves preview, reading
an immutable, already-persisted specification version.

## Core principle: immutable, server-derived, never client-trusted

Every fact that matters for a deployment decision — the specification
version and its checksum, which validation run backs it, whether the preview
build succeeded and matches, the schema-compatibility verdict, who approved
it and when — is derived from already-persisted rows, frozen once into an
immutable manifest, and never re-derived from or accepted from the browser.
A release, once prepared, cannot be edited; only a new release (for a new
specification version) can supersede it.

## Release lifecycle

```
draft ──approve──> approved ──deploy (succeeds)──> published ──superseded by a later release──> superseded
  ^                                                                                                   |
  |                                                                                                    | rollback re-activates
  +---------------------------------- (a NEW draft is prepared for a newer spec version) -------------+
```

- **`draft`** — `prepareRelease` has frozen a manifest for an exact,
  eligible specification version. Idempotent: preparing the same version
  twice returns the same draft.
- **`approved`** — `approveRelease` re-ran eligibility FRESH (not trusting
  the frozen snapshot) and it still held. Binds approval to the exact
  version/checksum.
- **`published`** — a deployment successfully activated this release as the
  app's current production pointer. A release also returns to `published`
  after a rollback re-activates it.
- **`superseded`** — was `published`; a later release (forward deploy or
  rollback) took over the production pointer. Still rollback-eligible.
- **`archived`** — explicitly retired (currently: a release that failed
  POST-ACTIVATION verification is archived rather than left casually
  rollback-eligible without review). No longer rollback-eligible.

A newer draft being prepared/edited **never** affects an already-approved or
published release — they are different rows, pinned to different
specification versions. If the app's specification moves on after a release
was approved, that draft's own path to production requires its own fresh
`prepareRelease`/`approveRelease` cycle; the older approved/published
release is untouched.

See `lib/repositories/releases.ts` and `lib/db/schema.ts`'s `releases` table.

## Release eligibility (`lib/deployment/eligibility.ts`)

Re-derived from persisted rows every time it's checked — at `prepareRelease`,
at `approveRelease` (catches staleness introduced between prepare and
approve), and transactionally inside `createDeployment` immediately before
enqueuing (never trusting any earlier check). A version is eligible only
when **all** of the following hold:

1. A `validation_runs` row exists for this app with this EXACT
   `specificationVersionId` **and** `specificationChecksum`, `status =
   'passed'`, and `releaseEligible = true` (computed once, authoritatively,
   by M10's `finalizeRun` — never recomputed here from raw gate rows).
2. The preview build pinned to that exact version + the running
   `REGISTRY_VERSION` succeeded, and its checksum matches the version's own
   checksum.
3. Generated-data schema compatibility relative to the currently-live
   production release (if any) is not `"unsafe"` —
   `lib/deployment/dataCompatibility.ts` diffs entities via M09's own
   `classifyEntityEvolution`, and for a tightened constraint, checks whether
   any LIVE PRODUCTION record (never preview/demo data) actually violates
   it.
4. The app is not archived.

Capability/actor authorization (`app.deployRelease` / `app.approve`) is
checked separately by the caller via `assertCapability` — eligibility itself
is actor-independent.

## Immutable release manifest (`lib/deployment/manifest.ts`)

Frozen once at `prepareRelease` time into `releases.manifest` (jsonb), with
`releases.manifestChecksum` (canonical SHA-256, `@asafarim/appbuilder-schema`'s
`checksumOf`) proving byte-identity later. Contains: release id, app id, app
slug/production host, specification version id/number/checksum/schema
version, preview build id/checksum, registry version, the backing
validation run id and gate-set version, the generated-data compatibility
verdict, the previous production release id (rollback breadcrumb frozen even
before this release is ever deployed), the initiating actor, and a
preparation timestamp. Approval/deployment actor and timestamp facts are
**not** part of the frozen, checksummed object — they live on the
`releases` row's own columns (`approvedByPrincipalId`/`approvedAt`,
`publishedByPrincipalId`/`publishedAt`) and are merged in only for display
(`composeManifestView`), since they don't exist yet at freeze time.

## Deployment worker (`lib/deployment/pipeline.ts`, `lib/repositories/deployments.ts`)

Extends the existing M07/M08/M10 durable-job pattern exactly: atomic claim
via `SELECT ... FOR UPDATE SKIP LOCKED`, lease + heartbeat, an optimistic
`WHERE status = from` guard on every status transition, cooperative
cancellation via a 3-second poll watcher in `worker.ts`, and a periodic
stale-lease sweep so correctness never depends on Redis/BullMQ delivery.

Phases, in order (`deployments.phase`):

```
queued → checking_eligibility → freezing_manifest → reserving_slug →
checking_data_compatibility → preparing_artifact → publishing →
health_checking → smoke_testing → activating → verifying → completed
```

Everything through `smoke_testing` is **pre-activation**: a failure at any
of those phases marks the deployment `failed` and leaves the current
production pointer completely untouched (no transaction ever touched
`app_domains`/`releases` yet). What each phase actually checks (there is no
separate artifact to build or push — the "artifact" is the already-persisted
specification version itself):

- **checking_eligibility** — reconfirms eligibility (forward deploy) or that
  the rollback target was previously published (rollback).
- **freezing_manifest** — recomputes the manifest checksum and compares to
  `manifestChecksum`, proving the frozen manifest hasn't been tampered with.
- **reserving_slug** — creates (or reuses) the app's `app_domains` row for
  its slug. A slug that no longer matches the app's CURRENT slug (an
  explicit slug change since this release was prepared) fails rather than
  silently moving the domain — slug changes are an explicit, separately
  reviewed operation, never applied automatically by a deployment.
- **checking_data_compatibility** — refuses an `"unsafe"` verdict.
- **preparing_artifact** — confirms the release's pinned `registryVersion`
  still matches the currently running registry.
- **publishing** — a no-op by design; there is nothing to push anywhere.
- **health_checking** / **smoke_testing** — in-process structural checks
  against the frozen specification (a reachable home page, at least one
  role/permission defined) — no live HTTP needed pre-activation.
- **activating** — the ONE atomic transaction: flips `app_domains.status`
  to `active` + `activeReleaseId` to this release, marks any superseded
  release `superseded`, marks this release `published`, and stamps
  `deployments.activatedAt`. Guarded by optimistic `WHERE` clauses
  throughout — a concurrent activation attempt fails the whole transaction
  rather than corrupting the pointer.
- **verifying** (post-activation) — a REAL HTTP request to the app's own
  internal origin with the target production `Host` header set
  (`APPBUILDER_INTERNAL_ORIGIN`, default `http://127.0.0.1:3000`) — exactly
  how Caddy's wildcard block routes it, with no dependency on live DNS/TLS
  to self-verify. Any non-5xx response (200, a sign-in redirect for an
  unauthenticated probe, even a 404) counts as "the route is alive"; only a
  5xx or network failure triggers automatic rollback (see below).

**Bounded retry**: only an INFRASTRUCTURE-classified failure (an unexpected
exception, never a deterministic business rejection like ineligibility, a
reserved slug, or a genuine health/smoke failure — those would fail
identically on retry) is retried, up to `DEPLOYMENT_LIMITS.MAX_DEPLOYMENT_ATTEMPTS`
(3), with the same backoff/nudge mechanism M07 uses. Deliberately scoped to
pre-activation phases only — `activating` and `verifying` are side-effecting
with exactly-once semantics and are never blindly retried.

**Automatic rollback on post-activation failure**: if `verifying` reports
failure, `restorePreviousPointer` atomically restores `app_domains` to the
previously-active release (or deactivates the domain if there was none),
marks the restored release `published` again, and archives the just-failed
release. The deployment itself is marked `failed` with
`post_activation_verification_failed`.

## Rollback

`rollbackToRelease` (`lib/repositories/deployments.ts`) creates a **new**
`deployments` row (`isRollback: true`) targeting an earlier, already-
published release — release history is never rewritten. Validated before
enqueuing: the target belongs to the same app, was previously published,
and its pinned `registryVersion` still matches the currently running
registry (a simple, conservative runtime-compatibility gate). Runs through
the identical activate/verify pipeline as a forward deploy (skipping the
eligibility re-check — the target already proved itself once) — including
automatic pointer restoration if the rollback's own post-activation
verification fails.

## Cancellation

`requestDeploymentCancellation` only ever succeeds while
`deployments.activatedAt IS NULL`. Once the pointer has moved, cancellation
is refused outright (409) — a rollback is the only way back, by design (see
issue requirement "cancellation before activation").

## Routing and TLS architecture

`proxy.ts` (Next.js 16's `middleware.ts` successor) gained a new branch,
checked before the builder's own path-based auth allowlist:

1. `lib/routing/resolveAppHost.ts#isManagedAppsDomainHost` — Edge-safe, pure
   host normalization (lowercase, port-stripped, ASCII-only, rejects
   punycode/`xn--` outright rather than attempting IDNA normalization,
   rejects IP literals and malformed DNS labels).
2. If the host is under `apps.asafarim.com` at all but doesn't parse to a
   valid, non-reserved slug (`RESERVED_APP_SLUGS`: `www`, `api`, `admin`,
   `appbuilder`, `preview`, `auth`, `hub`, `status`, `mail`, `support`, plus
   every other first-party subdomain already live on asafarim.com) → a
   generic 404, before any app logic runs.
3. Otherwise, API paths (`/api/**`) pass through untouched (each runtime API
   route resolves its own environment from the request Host independently —
   see below); page paths are rewritten internally to
   `/_managed-app/{slug}/...` and auth-gated (every path on a managed-app
   host requires an active platform session — the builder's own
   `publicRoutes` allowlist has no meaning on a different logical origin).

`app/_managed-app/[slug]/[[...path]]/page.tsx` re-resolves the app id and
its ACTIVE release fresh from `app_domains` (never trusting the slug or any
header as authoritative beyond "look this up"), then calls
`resolveRuntimeContext(db, actor, appId, { environment: "production" })` →
`loadActiveReleaseSpec` and renders through the **exact same**
`renderLiveOrAccessDenied`/`LiveShell` component tree the preview route
already uses — no separate rendering implementation exists to drift out of
sync.

`lib/generated-data/routeHelpers.ts#resolveContextForRequest` derives
`environment` for every M09 runtime API call from the REQUEST'S OWN Host
header resolved against `app_domains` — never from a query parameter, a
client header, or the URL's `[appId]` segment alone; it defaults fail-closed
to `preview`. The same function enforces an origin check
(`assertTrustedOrigin`): a mutating request's `Origin` header, when present,
must exactly match either this specific app's own resolved production host
or the builder's own configured origin — a broad `*.asafarim.com` origin is
never trusted just for sharing that suffix.

### DNS and TLS

**Required DNS record**: a wildcard record for the managed-apps domain,
pointing at the VPS: `*.apps.asafarim.com` → `A 82.25.116.73` (or a CNAME to
an existing A record, per your DNS host's conventions).

**Why DNS-01**: HTTP-01 can only prove ownership of a host that already
exists and is reachable at request time — it cannot prove ownership of
`*.apps.asafarim.com` as a wildcard. A DNS-01 challenge (Caddy provisioning
a `TXT` record via your DNS provider's API) is required, which means Caddy
needs a build with that provider's module — the stock `caddy:latest` image
(currently used by `docker-compose.prod.yml`) has none.

**Rollout sequence** (all deliberate, human-reviewed steps — nothing here is
automated or was executed as part of this change):

1. Confirm which `caddy-dns` module (e.g. `github.com/caddy-dns/cloudflare`)
   is compatible with whatever DNS host actually manages `asafarim.com`'s
   records today. This has NOT been confirmed as part of this change.
2. Build `infra/caddy/Dockerfile` with that module's real path substituted
   for `<provider>` (an `xcaddy build --with <module>` custom image).
3. Add the DNS-01 API token as `CADDY_DNS_API_TOKEN` in the VPS's environment
   (never committed to the repo).
4. **Test against Let's Encrypt's STAGING ACME endpoint first**
   (`acme_ca https://acme-staging-v02.api.letsencrypt.org/directory` inside
   the `tls` block) — staging certs aren't trusted by browsers but let you
   confirm the DNS-01 challenge actually succeeds without burning your real
   ACME rate limit or serving an untrusted cert to real traffic.
5. Once staging succeeds, remove the `acme_ca` override (defaults to
   production Let's Encrypt) and switch `docker-compose.prod.yml`'s `caddy`
   service from `image: caddy:latest` to building from
   `infra/caddy/Dockerfile`.
6. Uncomment the `*.apps.asafarim.com` block in `infra/caddy/Caddyfile` (it
   is deliberately commented out in this change — see that file's own
   comment for why an uncommented block against the CURRENT stock image
   would break every app behind this Caddy instance, not just AppBuilder).
7. Redeploy. Caddy handles renewal automatically thereafter — no ongoing
   action needed.

**Secret handling**: `CADDY_DNS_API_TOKEN` is read from the environment only,
scoped to DNS-edit permission for the managed-apps zone only if your
provider supports scoping. Never committed to this repo, never logged.

**Rollback procedure**: if the wildcard cert setup breaks anything, revert
`docker-compose.prod.yml`'s `caddy` service to `image: caddy:latest` and
re-comment (or delete) the `*.apps.asafarim.com` block — every other
subdomain is a separate, independent Caddy block and is never affected by
this one failing to obtain a certificate.

Every production deployment is served over HTTPS once the above is
complete — Caddy issues/renews the cert automatically for every activated
slug under the wildcard, with no per-app certificate provisioning step.

## Production data separation

M09's generated-data tables previously had zero environment/namespace
scoping — every table was keyed by `appId` alone. This branch closes that
gap completely before M11 ever writes real production rows:

- A `generated_environment` enum (`"preview" | "production"`) column was
  added to every M09 table (`generatedAppMembers`, `generatedRecords`,
  `generatedRecordRevisions`, `generatedRecordRelations`,
  `generatedUniquenessClaims`, `generatedFiles`, `generatedActivity`,
  `generatedNotifications`, `generatedWorkflowExecutions`,
  `generatedDataIdempotency`, `generatedRowAccessRules`), folded into every
  uniqueness/idempotency index and lookup index.
- Defaults to `"preview"` at the database level — a code path that forgets
  to specify an environment writes preview data, never production; the
  dangerous direction requires an explicit, deliberate `"production"`.
- `environment` is NEVER client-supplied. It is derived server-side from
  HOW a request arrived: a request whose resolved Host matches a persisted
  ACTIVE `app_domains` row → `production`; the builder's own
  `/apps/{id}/preview` route (or anything else) → `preview`.
- **Preview reset can never touch production**: `resetGeneratedData`'s
  delete predicates are hardcoded to `environment = "preview"` literally —
  not derived from any parameter — so a "reset demo data" click is
  structurally incapable of deleting a single real production record, even
  after M11 starts writing them.
- **Relations can't cross environments**: `validateRelationTarget` requires
  a relation's target record to resolve within the same `(appId,
  environment)` — a production record can never point at a preview record
  or vice versa, because the target simply does not resolve outside its own
  environment.
- **Idempotency can't cross environments**: `generatedDataIdempotency`'s
  unique index includes `environment` — a client cannot replay a preview
  response snapshot into production (or vice versa) by reusing its own
  idempotency key.
- File storage keys, workflow executions, notifications, and row-access
  rules are all environment-scoped the same way.
- Static/cache keys and generated-app authorization
  (`lib/generated-data/runtimeAuth.ts`) already key off `(appId,
  environment)` together, so one app's cached preview output can never be
  served as another app's (or its own) production output.

## Failure/rollback behavior summary

| Scenario | Outcome |
|---|---|
| Eligibility check fails at any pre-activation phase | Deployment `failed`; production untouched |
| Infrastructure exception, retries remain | Lease released, requeued with backoff (up to 3 attempts) |
| Activation transaction fails (concurrent activation, stale reservation) | Transaction rolled back entirely; production untouched |
| Post-activation verification fails | Automatic restore of the previous pointer; new release archived; deployment `failed` |
| Cancellation requested before activation | Deployment `cancelled`; production untouched |
| Cancellation requested after activation | Refused (409) — use rollback |
| Worker crashes mid-deployment | Lease expires; sweep reclaims and resumes from the persisted `phase` |

## Testing wildcard routing locally / in CI

`tests/e2e/specs/m11-releases-deployment.spec.ts` and `playwright.config.ts`
set `APPBUILDER_MANAGED_APPS_DOMAIN=apps.localhost` for the app/worker dev
servers and the test runner itself. Every browser resolves `*.localhost`
straight to loopback with zero DNS or hosts-file setup (RFC 6761), so
`{slug}.apps.localhost:3006` is a real, directly navigable URL with a real,
correctly-set `Host` header — no public DNS involved and no header-spoofing
needed (Chromium's DevTools protocol rejects `Host` in
`setExtraHTTPHeaders` outright as a forbidden header, which is why an
earlier draft of these specs using that approach failed with
`net::ERR_INVALID_ARGUMENT`). The deployment pipeline's own internal,
server-side self-verification request (`lib/deployment/pipeline.ts`'s
`defaultVerifyProductionRoute`) uses a plain Node `fetch` with an explicit
`Host` header instead, which has no such restriction.

## Migrations

Migration `0008_*` (generated via `pnpm db:generate`) adds: the
`generated_environment` enum/columns across every M09 table (and their
environment-aware indexes), the `releases`/`appDomains`/`deployments`/
`deploymentSteps` table extensions and new tables, and the new
`deployment_status`/`deployment_phase`/`deployment_failure_code`/
`app_domain_kind`/`app_domain_status` enums. No destructive column drops;
safe to apply to a fresh database and idempotent on rerun (a rerun is a
no-op once applied — drizzle's migration tracking table prevents
re-application).

## Explicit M12 deferrals

Per the issue, none of the following are implemented in M11:

- Custom customer domains (`appDomains.kind = "custom"` is defined in the
  schema but has no reachable code path — reserved for M12).
- Exported repositories / per-app containers / arbitrary generated code
  execution.
- Multi-region deployment.
- Billing.
- A public marketplace.
- Quota/retention/backup hardening beyond what deployment safety directly
  required here.
- A dedicated, distraction-free production rendering shell — the production
  route currently reuses the exact same root layout/chrome as the builder's
  preview route (including its top nav). This is not a new regression (the
  preview route already had this characteristic before M11); a dedicated
  production shell is a follow-up polish item, not a security or
  correctness concern.
- A "public" (no-membership-required) generated-app visibility tier — the
  existing product model only distinguishes `private`/`team` at the builder
  level, and generated-app runtime access has always required real
  membership regardless. M11 does not invent a new, unapproved public tier;
  production access is exactly as membership-gated as preview access
  already is.

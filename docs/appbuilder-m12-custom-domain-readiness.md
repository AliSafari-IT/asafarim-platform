# M12 Custom-Domain Readiness Design

## Status: NOT enabled

`APPBUILDER_CUSTOM_DOMAINS_ENABLED` is unset (falsy) in every environment
this milestone ships to — checked by
`lib/customDomains/featureFlag.ts#isCustomDomainsEnabled()`, a single
process-wide env-only flag, never a database row or per-app setting. The
readiness dashboard states this explicitly and unconditionally in its
"Custom-domain readiness" card. **No code path in this codebase provisions
DNS, issues a TLS certificate, or routes customer traffic for a custom
domain.**

## What exists

- **Data model** (`lib/db/schema.ts#customDomainRequests`): one row per
  requested host per app — `requestedHost`, `status`
  (`pending_verification` → `verified` | `blocked` | `cancelled`),
  `verificationToken`, `verificationMethod` (currently always `"dns_txt"`
  — the method is recorded, not yet acted on), `verifiedAt`, `tlsState`
  (`not_started` → `pending` → `issued` | `failed`), an optional
  `releaseId` association, and full audit history via `auditEvents`.
- **Request/cancel flow** (`lib/customDomains/requests.ts`):
  `createCustomDomainRequest` (owner-only —
  `app.manageCustomDomainRequest` capability) validates the hostname
  format, refuses without `acknowledgeNotEnabled: true` while the platform
  flag is off (so a caller/UI has to explicitly know this is readiness-only),
  and enforces "one pending request per app" plus global host uniqueness.
  `cancelCustomDomainRequest` frees the host (idempotent).
- **Collision prevention**: a partial unique index on
  `custom_domain_requests.requested_host` (`WHERE status <> 'cancelled'`
  — `lib/db/migrations/0010_*.sql`) — two apps, or an app and a re-request,
  can never simultaneously hold the same host. This piggybacks on the same
  pattern `app_domains.host`'s existing global unique index already uses
  for auto-slug hosts.
- **UI**: the readiness dashboard's "Custom-domain readiness" card always
  states the enabled/disabled fact up front, shows the current request (if
  any) with its verification/TLS state, and lets an owner submit or cancel
  a request — all while the platform-wide feature remains off.

## What does NOT exist (by design)

- DNS record provisioning or verification (the `dns_txt` method is
  recorded as intent, not executed — no DNS provider integration exists).
- TLS certificate issuance (no ACME/cert-manager/Caddy-config integration).
- Any routing change — `lib/routing/resolveAppHost.ts`'s
  `resolveActiveDomainForHost` only ever resolves against `app_domains`
  (the auto-slug table), never `custom_domain_requests`. A verified custom
  domain today has **zero** effect on what traffic is served.
- A DNS-provider decision — Hostinger, Cloudflare, Route53, etc. — this is
  explicitly deferred to a future milestone with its own authorization.

## Ownership-verification design (for the future flag-on milestone)

The intended flow, matching the schema already in place:

1. Owner requests a host → `verificationToken` is minted
   (`asafarim-verify-<32 hex chars>`).
2. Owner is instructed (UI copy, not yet written since the flag is off) to
   create a DNS TXT record at `_asafarim-challenge.{host}` with that token
   as the value.
3. A background job (not yet built) polls DNS for that TXT record and
   flips `status` to `verified`, records `verifiedAt`.
4. Only once `verified` would TLS issuance begin (`tlsState: pending` →
   `issued`), and only once `issued` would the host become eligible for
   `app_domains` activation via the SAME `activeReleaseId` pointer-swap
   mechanism M11 already built for auto-slug hosts — a custom domain does
   not need a new activation mechanism, only a new way to REACH the
   `app_domains` table's existing `custom` `kind` value (already defined in
   the schema, already unreachable — see `appDomainKindEnum`).

## Explicit authorization gate

Turning the flag on requires, at minimum: a DNS-provider decision (which
service performs the actual record verification/automation), a TLS
issuance strategy (managed cert provider vs. self-managed ACME), and
explicit sign-off — none of which this milestone performs or assumes. This
document exists so that future work has a concrete, already-tested data
model to build on rather than starting from nothing.

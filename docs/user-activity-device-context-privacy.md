# Device-context capture — privacy and retention

Covers the normalized browser/OS context added for issue #349: sign-in
device context (`packages/auth`'s `recordSignInEvent`) and Vionto render-job
device context (`apps/vionto`'s render routes). Written after the feature
shipped, as the honest documentation of what exists today — not a
pre-approved policy signed off by a privacy/security review. That review is
explicitly still open; see "What is not yet decided" below.

## What is captured

For a sign-in (any provider) and for a Vionto render-job creation request,
the raw `User-Agent` header is parsed (via `ua-parser-js`, in
`packages/auth/src/device-context.ts`'s `parseUserAgent`) into:

- `browserFamily` / `browserVersion` (e.g. `"Chrome"` / `"128.0.0.0"`)
- `osFamily` / `osVersion` (e.g. `"Windows"` / `"10"`)
- `deviceClass` (`"desktop"`, `"mobile"`, `"tablet"`, ... — from the parser's
  own device-type classification, defaulting to `"desktop"` when the parser
  finds no device signal, which is the common case for a normal browser)
- `parsedWith`: the parser identifier, so a historical row's interpretation
  stays reproducible if the parsing library is ever swapped or upgraded in a
  way that changes results

Nothing more precise is derived from the request than what the User-Agent
string itself states. No fingerprinting beyond this single header, no
collection of unrelated headers, no cross-request device linking.

**Sign-in only** additionally captures:
- The client IP, on the pre-existing `AuditLog.ipAddress` column — every
  other admin audit event already populates this column (see
  `apps/admin/lib/audit.ts`'s `getClientIp`), so this is not a new category
  of collection, just a new row type using an existing column.
- A truncated (300-char) copy of the raw `User-Agent` string, for
  support/debugging when the normalized fields are insufficient to diagnose
  an issue. Never displayed in the admin UI — see "Where it's surfaced"
  below.

**Vionto render-job creation** does **not** capture IP. The issue that
requested this feature explicitly gates broader request/network context
behind a privacy/security review; only the browser/OS fields (the
uncontroversial, explicitly-requested part) shipped without one.

## Where it's stored

No new tables. Both capture points write into a JSON column on a model that
already existed before this feature:

| Event | Table | Column |
|---|---|---|
| Sign-in | `AuditLog` (shared platform DB) | `changes.device` (JSON), plus `ipAddress` (existing typed column) |
| Vionto render-job creation | `ViontoAuditEvent` (Vionto's isolated DB) | `metadata.device` (JSON), row keyed by `action: "RENDER_STARTED"`, `entity: "ViontoRenderJob"`, `entityId: <jobId>` |

## Where it's surfaced

- `packages/activity`'s Hub adapter (`hub.ts`) reads `AuditLog.changes.device`
  and `AuditLog.ipAddress` back for the User 360 login-history entries.
  **The admin UI renders the formatted device string (e.g. "Chrome 128 on
  Windows 11") but never the raw IP or the raw User-Agent string** — see
  `apps/admin/app/(admin)/users/[id]/page.tsx`'s Timeline `meta` builder,
  which only calls `formatDeviceContext`.
- `packages/activity`'s Vionto adapter (`vionto.ts`) reads
  `ViontoAuditEvent.metadata.device` back for render-job entries, same
  formatted-only display, in both the merged User 360 timeline and the
  dedicated `/users/[id]/vionto` view.
- Both surfaces are superadmin-gated (`requireRole([ROLES.SUPERADMIN])`) and
  every view is itself audited (`writeAuditEvent`, action
  `user.activity.viewed` / `user.vionto_history.viewed` /
  `platform.activity.viewed`) — "the watcher is watched," per #301's
  original product principles.

## Retention

Both `AuditLog` and `ViontoAuditEvent` are **indefinite, compliance/audit-
trail records with no automated sweep** — this predates #349 and is
unchanged by it. Neither table has ever had a TTL or a deletion job; adding
device context to rows already stored this way does not change their
retention characteristics, it only adds a field to an already-indefinite
record.

This is the same posture AppBuilder documents for its own `audit_events`
table in `docs/appbuilder-m12-privacy-retention.md` ("Indefinite —
compliance/forensic record ... never a sweep target"). It is a reasonable
default for an audit trail, but — as that document also notes for its own
categories — **choosing a retention window for this specific new field is a
product decision this issue does not make unilaterally.**

## What is not yet decided

- **No retention window has been set for the `device`/`userAgentRaw` fields
  specifically.** They live exactly as long as the `AuditLog`/
  `ViontoAuditEvent` row they're on, which today means indefinitely.
- **No deletion/anonymization path exists** for a user who wants their
  historical device context removed independent of the rest of their audit
  trail (a partial-erasure operation), only the account-level erasure paths
  that already exist elsewhere in the platform, if any.
- **The IP-capture-for-render-jobs and any-raw-IP-in-UI questions are
  explicitly unresolved** — deferred exactly as the issue requested, pending
  a real privacy/security review rather than a unilateral implementation
  choice.
- This document itself has not been reviewed by anyone outside the
  implementation — it records what the code does today, not an approved
  policy. Issue #349 remains open partly because of this gap.

# TasksAI API version policy (M02)

**Base path:** `/api/v1` · **Spec:** [`openapi.json`](openapi.json), served live at `/api/v1/openapi.json`.

## Guarantees within `v1`

- **Additive only.** New endpoints, new optional request fields, and new
  response fields may appear at any time. Clients must ignore unknown
  response fields.
- **No breaking changes.** Removing or renaming a field, tightening a
  validation rule, changing an error `code`'s meaning, or changing a status
  code is a breaking change and requires `v2`.
- **Error codes are contract.** The `error.code` enum in the spec is stable;
  values are never repurposed.

## Conventions

| Concern | Rule |
|---|---|
| Pagination | Cursor: `?cursor=&limit=` (1–100, default 25). Response carries `page.nextCursor` (`null` at end). |
| Concurrency | `If-Match: "<version>"` on PATCH/DELETE of versioned resources. Absent = last-write-wins. Stale = `409 conflict_version`. |
| Idempotency | `Idempotency-Key` on POST. Same key + same body → stored response replayed. Same key + different body → `409 idempotency_mismatch`. |
| Correlation | `X-Correlation-Id` echoed on errors; generated if absent. |
| Rate limits | `429 rate_limited` with `Retry-After` (enforcement lands in M02 hardening / M09 metering). |

## Deprecation

A `v2` introduction keeps `v1` for **≥180 days**. Deprecated `v1` responses
carry `Deprecation: true` and `Sunset: <http-date>` headers. The changelog
lives at `docs/api/CHANGELOG.md` (created when the first change ships).

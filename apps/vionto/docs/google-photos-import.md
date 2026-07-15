# Google Photos Import — Design & Decision Record

> Milestone: **Vionto: Google Photos Import** ([#2](https://github.com/AliSafari-IT/asafarim-digital/milestone/2))
> Status: **Foundation landed** (spike decision, env/config, data model). Backend & UI tracked in follow-up issues.
> Last updated: 2026-05-31

This is the output of the spike ([#144](https://github.com/AliSafari-IT/asafarim-digital/issues/144))
plus the configuration ([#145](https://github.com/AliSafari-IT/asafarim-digital/issues/145))
and data-model ([#146](https://github.com/AliSafari-IT/asafarim-digital/issues/146)) decisions.

---

## 1. Goal

Let a signed-in Vionto user import photos into the current upload session from:

1. **Their own Google Photos library** — user-selected photos.
2. **A shared Google Photos album link** — paste a URL, import its media.

If the user is not yet authorized for Google Photos, they can **grant Vionto
access** (an OAuth consent flow) and then import — regardless of how they
logged into Vionto (Google, email/password, or email-code).

---

## 2. Key constraint: the Library API was restricted

Google **restricted the Photos Library API** effective **2025-03-31**. The broad
`photoslibrary.readonly` scope (read a user's entire library) is no longer
granted to general apps — it now only exposes **app-created** media. This breaks
the "list the whole library and let the user pick" approach that older guides
describe.

The supported replacement for **user-initiated import of arbitrary photos** is
the **Google Photos Picker API**: the app creates a *picker session*, sends the
user to Google's own picker UI, the user selects items there, and the app then
reads **only the selected** `mediaItems`. The user never grants blanket library
access — they hand-pick exactly what to share, session by session.

### Decision

| Use case | Chosen approach |
| --- | --- |
| Import from own library | **Photos Picker API** (`photospicker.mediaitems.readonly`) |
| Import from a shared album link | **Picker-first**, with Library-API sharing as a *gated* stretch (see §4) |

Rationale: the Picker API is the only path Google fully supports for general
apps post-restriction, it requires a **non-sensitive** scope (lighter
verification), and it gives users per-import consent — a privacy win.

---

## 3. OAuth scopes

| Scope | Purpose | Sensitivity |
| --- | --- | --- |
| `https://www.googleapis.com/auth/photospicker.mediaitems.readonly` | Read the items a user picked in a Picker session | Non-sensitive |

Configured via `GOOGLE_PHOTOS_SCOPES` (space/comma-separated). Additional scopes
will be appended here if/when the shared-album path (§4) needs them.

**Verification:** the Picker scope is not on Google's "sensitive/restricted"
list, so first-launch verification is light. If we later add a restricted
sharing scope, that triggers Google's restricted-scope verification + security
assessment — **start that early** because it can take weeks.

---

## 4. Shared album links — feasibility

Importing directly from a shared album **URL** historically used the Library API
sharing surface (`sharedAlbums`, join via `shareToken`, then
`mediaItems.search`). Those endpoints fall under the **restricted** Library API
scopes that now require Google verification + a security assessment, and only
return app-created data for general apps.

### Decision: ship the Picker path first; treat URL-based shared-album import as gated

- **Phase 1 (default):** When a user pastes a shared-album link, route them
  through the **Picker** (they open the album in Google and select from it).
  This needs no extra scope and works today.
- **Phase 2 (stretch, gated):** True URL → enumerate-items import, *only if* we
  obtain the restricted sharing scope and pass Google's assessment. Issues
  [#150](https://github.com/AliSafari-IT/asafarim-digital/issues/150) and
  [#154](https://github.com/AliSafari-IT/asafarim-digital/issues/154) carry this
  caveat and will be re-scoped to the Picker fallback if approval is not
  obtained.

---

## 5. Token strategy: incremental OAuth, decoupled from login

Vionto login already supports Google, email/password, and email-code
(`@asafarim/auth`). Photo import authorization is modelled as a **separate,
incremental OAuth grant** rather than piggybacking on the login identity:

- A user who logged in with **email/password or email-code** can still connect a
  Google account purely for importing photos.
- A user who logged in **with Google** is asked only for the *additional* Photos
  scope (incremental authorization) on top of their existing session.

We use a **dedicated OAuth client** (`GOOGLE_PHOTOS_CLIENT_ID/SECRET`) with its
own redirect URI (`/api/integrations/google-photos/callback`). It may reuse the
portal's `AUTH_GOOGLE_*` client **only** if that client's consent screen has the
Photos scopes added; a dedicated client keeps concerns separate and is preferred.

The grant is requested with `access_type=offline` + `prompt=consent` so we
reliably receive a **refresh token** for long-lived, background-free re-imports.

---

## 6. Data model (landed)

`GooglePhotosConnection` (Prisma, `@asafarim/db`) — one row per user:

| Column | Notes |
| --- | --- |
| `userId` (unique, FK→User, cascade delete) | Connection is per Vionto user |
| `googleAccountEmail`, `googleAccountSub` | The Google account that granted access (may differ from login email) |
| `accessTokenEnc`, `refreshTokenEnc` | OAuth tokens, **encrypted at rest** (never plaintext) |
| `scopes` (`String[]`) | Granted scopes |
| `expiresAt` | Access-token expiry |
| `status` (`active`\|`revoked`\|`error`) + `lastError` | Lifecycle |
| `lastRefreshAt`, `lastImportedAt` | Diagnostics |

Migration: `packages/db/prisma/migrations/20260531120000_add_google_photos_connection`.

### Token encryption

Tokens are encrypted with **AES-256-GCM** (authenticated; tampering is detected
on decrypt) using `VIONTO_TOKEN_ENCRYPTION_KEY` (a 32-byte key — 64 hex chars or
base64). Payload format: `iv.authTag.ciphertext` (base64url).

- Crypto helpers: [`lib/server/google-photos/crypto.ts`](../lib/server/google-photos/crypto.ts)
- Repository (encrypt/decrypt + upsert/refresh/delete): [`lib/server/google-photos/connection.ts`](../lib/server/google-photos/connection.ts)
- Tests: `lib/server/__tests__/google-photos-crypto.test.ts`, `…-connection.test.ts`

The repository is the **only** layer that touches the encrypted columns; routes
and the import pipeline consume the decrypted `GooglePhotosConnectionView`.

---

## 7. Configuration

| Env var | Purpose |
| --- | --- |
| `GOOGLE_PHOTOS_CLIENT_ID` / `GOOGLE_PHOTOS_CLIENT_SECRET` | OAuth client for the Photos grant |
| `GOOGLE_PHOTOS_REDIRECT_URI` | OAuth callback (`…/api/integrations/google-photos/callback`) |
| `GOOGLE_PHOTOS_SCOPES` | Space/comma-separated scopes (default: Picker readonly) |
| `VIONTO_TOKEN_ENCRYPTION_KEY` | 32-byte AES-256-GCM key (`openssl rand -hex 32`) |

See [`apps/vionto/.env.example`](../.env.example) and the root `.env.example`.

### Google Cloud Console setup (manual, [#145](https://github.com/AliSafari-IT/asafarim-digital/issues/145))

1. Enable the **Photos Picker API** (and Photos Library API only if Phase 2 is pursued).
2. Configure the **OAuth consent screen**: add the Picker scope, app domain,
   privacy-policy + terms URLs, and per-scope justifications.
3. Create an **OAuth client** (Web), add redirect URIs for local
   (`http://localhost:3006/...`) and prod (`https://vionto.asafarim.com/...`).
4. Copy the client id/secret into the deployment secrets.
5. If a restricted scope is added later, **begin Google verification early**.

---

## 8. End-to-end flow (target)

```
User (any login)
  └─ "Connect Google Photos"  ──▶  /api/integrations/google-photos/connect
        consent (offline, prompt=consent)
        └─ /callback ──▶ exchange code ──▶ upsert GooglePhotosConnection (tokens encrypted)

Import (library)
  └─ create Picker session ──▶ user picks in Google UI ──▶ poll until done
        └─ list selected mediaItems ──▶ /import ──▶ download baseUrl
              └─ stream to Spaces/S3 (user-scoped key) ──▶ stage in upload session
                    └─ appears in ImageOrganizer, same as a normal upload
```

Token freshness is handled by a `getValidGooglePhotosAccessToken(userId)` helper
(issue [#148](https://github.com/AliSafari-IT/asafarim-digital/issues/148)) that
refreshes via the stored refresh token and persists the new token through
`updateGooglePhotosAccessToken`.

---

## 9. Privacy & compliance (issue [#156](https://github.com/AliSafari-IT/asafarim-digital/issues/156))

- Disclose Google Photos access and **Limited Use** in `/privacy` and `/terms`.
- Show an in-product consent/explanation before the first connect.
- On **disconnect** and on **account deletion**, revoke tokens at Google and
  delete the `GooglePhotosConnection` row (wired into retention enforcement).

---

## 10. Open items handed to follow-up issues

- OAuth connect/callback routes + incremental authorization — [#147](https://github.com/AliSafari-IT/asafarim-digital/issues/147)
- Token refresh, status, disconnect/revoke — [#148](https://github.com/AliSafari-IT/asafarim-digital/issues/148)
- Picker session API — [#149](https://github.com/AliSafari-IT/asafarim-digital/issues/149)
- Shared-album import (gated) — [#150](https://github.com/AliSafari-IT/asafarim-digital/issues/150)
- Download/ingest pipeline — [#151](https://github.com/AliSafari-IT/asafarim-digital/issues/151)
- Frontend connect/import UI — [#152](https://github.com/AliSafari-IT/asafarim-digital/issues/152), [#153](https://github.com/AliSafari-IT/asafarim-digital/issues/153), [#154](https://github.com/AliSafari-IT/asafarim-digital/issues/154)
- Quotas/retries, compliance, tests/docs — [#155](https://github.com/AliSafari-IT/asafarim-digital/issues/155), [#156](https://github.com/AliSafari-IT/asafarim-digital/issues/156), [#157](https://github.com/AliSafari-IT/asafarim-digital/issues/157)

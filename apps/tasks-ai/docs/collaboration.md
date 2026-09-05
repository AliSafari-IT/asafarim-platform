# TasksAI — Collaboration, realtime & notifications (M04)

## Invitations & membership lifecycle

- `POST /workspaces/{slug}/invitations` (admin+): email + role → a tokened,
  14-day invitation. `emailHash` (sha256) is what's indexed/unique per
  `(workspace, status)`; the raw email is stored for the send but never
  used as a key.
- `POST /invitations/accept` `{ token }`: token proves the address, the
  session proves identity. Upserts the membership (re-activates an archived
  one), marks the invitation `accepted`. **Replaying an accepted/revoked/
  expired token is a 404** — no info leak, no second membership.
- `DELETE /workspaces/{slug}/invitations/{id}` (admin+): revoke.
- Owner transfer / role change / guest scoping ride on the M02
  `authorize()` + `MemberRole` model.

## Comments, mentions, watchers

- Mentions in a body are `@[Display Name](membershipId)`. `parseMentions`
  caps distinct mentions at **20** and de-dupes — a comment cannot fan out
  to everyone.
- Mentioned ids are resolved **against this workspace's active memberships
  only**; a token carrying another workspace's id resolves to nothing, so
  cross-tenant pinging is impossible (integration-tested).
- Author + mentioned members become **watchers**. Notifications: one
  `mention` per mentioned member, one `comment` per other watcher, each
  with a `dedupeKey` so a burst collapses.

## Notifications

- In-app inbox: `GET /workspaces/{slug}/notifications` (`?unread=true`),
  `POST .../notifications/read` `{ ids }`.
- Preferences: `GET`/`PATCH /workspaces/{slug}/notification-preferences` —
  `emailDigest`, `digestCadence` (off/hourly/daily), `mentionEmail`,
  `assignmentEmail`, `quietHours` (`HH:MM-HH:MM`).
- Every notification also writes one `OutboxEvent` (`notification.dispatch`).
  The worker's outbox drainer processes it (stub delivery in M04 — logs and
  flags the row for the digest sweep; real SMTP/push in M04 follow-up /
  M12), with exponential backoff and a `dead` state after 6 attempts.

## Realtime (SSE-first)

- `GET /workspaces/{slug}/stream?since=<iso>` → `text/event-stream`. The web
  process holds **no** Redis subscription; each stream polls `ActivityEvent`
  for the workspace every 3s and emits new rows plus keep-alives. Stateless
  web tier; up to ~3s latency, revisited under load in M11.
- Stale writes are **not** silently overwritten: the API's `If-Match` /
  `409 conflict_version` path is the conflict resolution; the stream only
  says "re-fetch".

## Attachments

- `Attachment` stores **metadata only**; bytes live in private object
  storage (`@asafarim/storage`). A per-object `scanState`
  (`pending`/`clean`/`quarantined`/`skipped`) gates downloads — a `pending`
  or `quarantined` object is not downloadable. Signed, time-limited
  download URLs; the app never proxies file bytes. Upload/scan wiring and
  signed-route handlers land in the M04 follow-up alongside real SMTP.

## Security tests (integration)

- Invitation replay → 404, single membership.
- Cross-tenant mention → zero notifications for the outside member.
- Mention storm → one notification per member, watcher added once.
- Outbox drain → idempotent, no rows left pending.

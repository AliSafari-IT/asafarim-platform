# TimelineAI

Create polished, visual timelines — project plans, roadmaps, Gantt charts,
calendars, and storytelling — without any design or technical skill. Works
for signed-in users (with a dashboard and self-publishing) and for guests
(create → export → submit for admin review, no account needed).

Live at [tlai.asafarim.com](https://tlai.asafarim.com) · Hub SSO at
[hub.asafarim.com](https://hub.asafarim.com) · local dev on port **3010**.

## Status

MVP complete. All 12 implementation phases from the product spec have
landed:

- Prisma schema (`Timeline`, `TimelineEvent`, `TimelineModerationEvent`) in
  the shared platform database.
- Hub SSO session/role wiring, no separate login.
- Server-side authorization gate (`lib/access-rules.ts`) covering every
  combination of owner/guest/admin × view/edit/delete/moderate ×
  public/private/pending/approved/rejected — unit tested.
- Timeline/event CRUD with a drag-and-drop **and** fully keyboard-accessible
  editor, live preview, client + server Zod validation.
- All 8 layouts: vertical, horizontal, zigzag, radial, roadmap, Gantt,
  calendar, interactive.
- Authenticated dashboard with self-publish (no moderation needed).
- Guest submission flow: hashed-IP identity (raw IPs are never stored),
  Redis-backed rate limiting with a fail-open safety net, pending-until-
  approved visibility.
- Admin moderation panel: approve/reject/edit/delete, with a durable audit
  trail that survives deletion of the timeline it describes.
- PNG/JPG/PDF export via headless Chromium (Puppeteer), rendering the app's
  own public page with the platform chrome stripped out.
- Platform nav integration — appears in Hub's ⌘Platform switcher and every
  other app's `AppSwitcher`.
- Dynamic `sitemap.xml`/`robots.txt` (only public, approved, published
  timelines are indexable), automated accessibility testing (axe-core), and
  e2e coverage for both spec-required happy paths.

See "Deferred / not done" below for what's intentionally out of scope for
this MVP.

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4
- Prisma/Postgres through `@asafarim/db` (shared platform database, not an
  isolated schema — TimelineAI has no need for schema isolation)
- Auth.js v5 through `@asafarim/auth` (Hub-issued session, JWT, no local
  password table)
- `@asafarim/ui` (`AppShell`/`TopNav`/`ButtonLink`/`ConfirmDialog`) +
  `@asafarim/theme-toggle` for the shared platform chrome and light/dark mode
- `@dnd-kit/*` for drag-and-drop event reordering (with full keyboard
  fallback via Up/Down buttons — dnd-kit's own keyboard sensor also works)
- `ioredis` for guest rate limiting (fails open on Redis trouble — see
  `lib/server/guest-rate-limit.ts`)
- `puppeteer` for PNG/JPG/PDF export (matches `apps/edumatch`'s choice of
  export tooling)
- Vitest for unit tests, Playwright + `@axe-core/playwright` for e2e and
  automated accessibility checks

## Local development

From the repo root:

```bash
pnpm install
pnpm --filter timelineai dev
```

Or use the `timelineai` launch config if you're driving the whole platform
through `.claude/launch.json`. The app boots on **http://localhost:3010**.

### Environment variables

Copy `.env.local.example` to `.env.local` (or rely on the root `.env.local`,
which this app also reads — see `next.config.ts`). The variables specific to
this app:

| Variable | Purpose |
|---|---|
| `TIMELINEAI_GUEST_IP_HASH_KEY` | HMAC key for hashing guest IPs before storing them. Generate with `openssl rand -hex 32`. **Required** for guest create/export — without it those endpoints reject with a clear error rather than silently storing a raw IP. |
| `TIMELINEAI_TRUSTED_PROXY_HOPS` | How many reverse-proxy hops to trust when resolving a guest's real IP from `X-Forwarded-For`. `0` in local dev (no proxy in front); `1` in production (Caddy). |
| `TIMELINEAI_INTERNAL_URL` | Where the app reaches *itself* for the export pipeline's headless Chromium to render its own public pages. Unset in dev (falls back to `NEXT_PUBLIC_TIMELINEAI_URL`); in prod this should be an internal address, not the public HTTPS domain. |
| `REDIS_URL` | Guest rate limiting. The app degrades gracefully (fails open, logs the error) if Redis is unreachable — it will never block a legitimate request because of an infra blip. |
| `PUPPETEER_EXECUTABLE_PATH` | Path to a system Chromium for export. Unset in local dev if Puppeteer's own bundled Chromium is available; set explicitly in Docker (see `Dockerfile`, which installs Alpine's `chromium` package). |

Everything else (`DATABASE_URL`, `AUTH_SECRET`, the cross-app
`NEXT_PUBLIC_*_URL` variables, S3 credentials for `@asafarim/storage`) is
shared platform configuration — see the root `.env.local.example`.

### Database

Uses the shared platform Postgres via `@asafarim/db`/Prisma — no separate
database or migration command. From the repo root:

```bash
pnpm db:migrate       # applies pending migrations, including TimelineAI's
pnpm db:seed          # RBAC roles + optional admin user (needed for the admin panel)
```

### Seed / fixture data

Eight example timelines — one per layout, ordered simple → sophisticated —
so there's always something to look at without creating content by hand:

```bash
pnpm --filter @asafarim/db db:seed:timelineai
```

Safe to re-run (upserts on a fixed id per timeline). Creates its own
deterministic demo author (`timelineai-demo@asafarim.com`, no password —
sign-in is impossible for that account) and publishes each timeline so
they're reachable at `/t/<publicId>` immediately, e.g.
`/t/demo-vertical-history` through `/t/demo-interactive-explore`.

## Testing

```bash
pnpm --filter timelineai test          # unit tests (Vitest)
pnpm --filter timelineai test:watch    # watch mode
pnpm --filter timelineai e2e           # end-to-end (Playwright)
pnpm --filter timelineai e2e:report    # open the last e2e HTML report
```

Unit tests cover the authorization matrix (`lib/__tests__/access-rules.test.ts`),
the guest rate limiter (`lib/__tests__/rate-limit.test.ts`), and the SSRF-hardened
URL validation on event images/links (`lib/__tests__/schemas.test.ts`).

e2e tests (`e2e/*.spec.ts`) run against a real dev server + real database and
cover:

- **Automated accessibility** (`accessibility.spec.ts`) — axe-core scans of
  the homepage and editor for serious/critical violations, a keyboard-only
  pass through the editor's controls, and a reduced-motion sanity check.
- **Guest submission** (`guest-submission.spec.ts`) — create → "needs
  review" messaging → pending-visibility-is-owner-only, through the real UI.
- **Authenticated self-publish** (`authenticated-publish.spec.ts`) — spec's
  e2e happy path #1: sign in via Hub's real credentials provider, create,
  confirm it's private until published, publish from the dashboard, confirm
  it's now publicly visible.
- **Admin moderation** (`admin-moderation.spec.ts`) — spec's e2e happy path
  #2: a guest submission, then a real admin session approving it into public
  visibility.

The sign-in-dependent specs need `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`
(from `pnpm db:seed`) and a running Hub (`pnpm --filter @asafarim/hub dev`)
reachable at `NEXT_PUBLIC_HUB_URL`.

## Export dependencies

PNG/JPG/PDF export runs headless Chromium via Puppeteer, server-side —
never a client-side screenshot. In production the Docker image installs
Alpine's `chromium` package and sets `PUPPETEER_EXECUTABLE_PATH`
accordingly (see `Dockerfile`); in local dev, Puppeteer's own bundled
Chromium is used unless `PUPPETEER_EXECUTABLE_PATH` is set. Export requests
are synchronous, bounded by a 20-second timeout, and rate-limited for
guests — see "Deferred" below for why this isn't a background job.

## Deployment

Docker Compose + Caddy on the shared platform VPS, same pattern as every
other app:

- `Dockerfile` — multi-stage build, installs a runtime Chromium for export.
- `docker-compose.prod.yml` — `timelineai` service (shared Postgres + Redis).
- `infra/caddy/Caddyfile` — `tlai.asafarim.com` → `timelineai:3000`, with
  generous timeouts for export requests.
- `infra/scripts/vps-deploy.sh` — `timelineai` is in `BUILD_SERVICES`.

Production secrets (`TIMELINEAI_GUEST_IP_HASH_KEY`,
`NEXT_PUBLIC_TIMELINEAI_URL`) need adding to `.env.production` and
re-encrypting (`pnpm env:encrypt`) — see `docs/environment-management.md`.
This wasn't done as part of the app's implementation since it touches the
platform's shared production secrets file.

## Architecture decisions

- **Shared Prisma database, not an isolated schema.** TimelineAI's data
  model has no need for the kind of isolation Testora/AppBuilder require —
  it's platform content like Vionto's, not a sandboxed per-app database.
- **Ownership is server-derived, never client-supplied.** Every mutation
  re-resolves `ownerUserId`/`guestIdHash` from the Hub session or a
  server-only hashed IP (`lib/server/guest.ts`) — the request body is never
  trusted for who's making a change.
- **One authorization function, not per-route checks.** `canAccess()` in
  `lib/access-rules.ts` is a pure function (no framework/DB imports) so it's
  cheaply unit-testable, and every service function and API route funnels
  through it or its server-aware wrapper — there's exactly one place that
  understands the owner/guest/admin × visibility/moderation matrix.
- **Content and presentation are strictly separate.** `Timeline.theme` and
  `Timeline.layout` never touch `TimelineEvent` rows — switching layout in
  the editor is a single-field update, never a data migration.
- **Export renders the app's own live page, not a separate template.**
  `lib/server/services/export.ts` navigates headless Chromium to
  `/t/<publicId>` (with a `x-timelineai-render: bare` header that strips the
  platform chrome) instead of maintaining a parallel HTML/PDF template — the
  export always matches what the live preview and public page show, by
  construction.
- **Guest rate limiting fails open.** A Redis outage degrades to "no rate
  limiting" (logged) rather than blocking real guests or hanging requests —
  discovered and fixed after an early version hung for 2 minutes on a
  flaky Redis connection during manual testing.

## Deferred / not done

Intentionally out of scope for this MVP, called out explicitly rather than
silently skipped:

- **Async export via a background job.** The spec allows either a
  synchronous export (behind timeouts/size/rate limits) or a queued job;
  this MVP took the synchronous path. If export volume or render time grows,
  the natural next step is a BullMQ job (the platform already has the
  infrastructure — see `apps/vionto`'s render pipeline) rather than adding
  `TimelineExportJob` bookkeeping now for a feature with no queue yet.
- **DNS-rebinding protection for event image URLs.** `lib/schemas.ts`
  blocks obvious SSRF vectors (non-https, localhost, RFC1918/link-local/
  cloud-metadata IP literals) at validation time, but doesn't re-check where
  a hostname *resolves* at fetch time — a public hostname could theoretically
  be rebound to a private IP between validation and Chromium's actual
  request during export. Worth an egress-time check if this becomes a real
  threat model concern.
- **Image upload via `@asafarim/storage`.** The schema supports
  `imageStorageKey` on events, but the editor only accepts external image
  URLs today — direct upload wiring is straightforward to add on top of the
  existing `@asafarim/storage` package but wasn't part of this MVP pass.
- **Production secrets.** `TIMELINEAI_GUEST_IP_HASH_KEY` and
  `NEXT_PUBLIC_TIMELINEAI_URL` still need adding to the encrypted production
  env file by someone with the authority to do so (see "Deployment" above).

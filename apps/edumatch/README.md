# EduMatch

A personal learning assistant that understands where a student is struggling,
helps immediately where it can, and — when human support is worth it —
prepares, matches, books, and tracks the tutoring. The web app, API routes,
tutor matching, payments, notification flows, and documentation live in this
Next.js app inside the ASafarIM Platform monorepo.

The core journey is: **ask → understand → clarify → help now → build a Learning
Brief → match up to five tutors → compare prepared proposals → book → learn →
track progress.** It starts at `/student/learn` with one question — "What would
you like help with?" — and no form.

See [`docs/edumatch-learning-brief.md`](../../docs/edumatch-learning-brief.md)
for the full design: data model, the interview script, matching weights and the
no-paid-placement guarantee, prepared proposals, the learning journey, and what
is not yet built.

## Status

Current state: migrated from `asafarim-digital`, redesigned, and passing its
production build and imported test suite. Launch hardening is tracked in the
[EduMatch milestone](https://github.com/AliSafari-IT/asafarim-platform/milestone/2).

Completed:

- Multi-role auth for students, tutors, and admins using shared ASafariM auth.
- Student intake, file upload presigning, inquiry persistence, and AI response
  generation with streaming support.
- Tutor profiles, Google Maps geocoding, PostGIS distance matching, quote
  requests, quote submission, acceptance, and decline flows.
- Stripe Connect onboarding, split-payment checkout, wallet balances, payout
  requests, and webhook handling.
- Quote PDF generation with Puppeteer/Handlebars and signed storage URLs.
- Email notification service for inquiry, AI, quote, booking, and payout events.
- Student and tutor dashboards, profile pages, checkout confirmation, bookings,
  earnings, legal pages, API docs, and admin tutor-matching diagnostics.
- Playwright configuration and focused E2E coverage for core web flows.
- Trust and safety groundwork including moderation helpers, notification
  preferences, booking cancellation/dispute/resolve APIs, tutor verification
  workflow, and audit event helpers.

Verification baseline (2026-08-06): typecheck passes, 240 tests pass (41 of
them new, covering the Help Center). Production build not verified as part
of this baseline — see the Help Center PR for what was and wasn't checked.

## Stack

- Next.js 16 App Router
- React 19 and TypeScript
- Tailwind CSS v4
- Prisma/Postgres through `@asafarim/db`
- NextAuth through `@asafarim/auth`
- Platform-native responsive navigation and shared country/language controls
- Latitude/longitude distance matching with explainable scoring
- DigitalOcean Spaces/S3-compatible storage
- OpenAI primary AI provider with Anthropic failover
- BullMQ and Redis for async AI/PDF/email work
- Stripe Connect for marketplace payments
- Resend for transactional email
- Puppeteer and Handlebars for quote PDFs
- Vitest and Playwright

## Local Development

From the repo root:

```bash
pnpm install
pnpm --filter edumatch dev
```

App: `http://localhost:3009`
Health: `http://localhost:3009/api/health`
API docs: `http://localhost:3009/docs`

## Scripts

```bash
pnpm --filter edumatch dev
pnpm --filter edumatch build
pnpm --filter edumatch start
pnpm --filter edumatch typecheck
pnpm --filter edumatch test
pnpm --filter edumatch test:watch
pnpm --filter edumatch lint
pnpm --filter edumatch clean
```

## Web Routes

| Route | Purpose |
| --- | --- |
| `/` | Public EduMatch landing page |
| `/docs` | API documentation |
| `/help` | Help Center home — search, role entry points, popular guides |
| `/help/students`, `/help/tutors` | Help Center audience indexes |
| `/help/students/[slug]`, `/help/tutors/[slug]` | Individual Help guides |
| `/student` | Student dashboard |
| `/student/profile` | Student profile setup |
| `/student/learn` | Conversational intake, immediate help, and Learning Brief review |
| `/student/brief/[id]/compare` | Compare prepared tutor proposals |
| `/student/journey` | Learning record — sessions, progress, patterns |
| `/student/inquiry/new` | Legacy single-shot inquiry intake |
| `/student/inquiry/[id]` | Inquiry detail and AI response |
| `/student/inquiry/[id]/quotes` | Tutor quote comparison |
| `/student/checkout/[quoteId]` | Booking checkout |
| `/student/booking/confirmation` | Payment confirmation |
| `/tutor` | Tutor dashboard |
| `/tutor/profile` | Tutor profile setup |
| `/tutor/invites` | Learning Briefs matched to this tutor |
| `/tutor/invites/[quoteRequestId]` | Student brief + prepared proposal to adjust and send |
| `/tutor/sessions/[bookingId]` | Write up a completed lesson |
| `/tutor/requests` | Open marketplace quote requests |
| `/tutor/quotes` | Tutor quote management |
| `/tutor/bookings` | Tutor bookings |
| `/tutor/earnings` | Wallet and earnings |
| `/tutor/settings` | Tutor notification preferences |
| `/tutor/connect/onboard` | Stripe Connect onboarding |
| `/tutor/connect/success`, `/tutor/connect/refresh` | Stripe Connect return pages |
| `/admin` | Admin overview dashboard |
| `/admin/tutor-verifications` | Admin tutor verification queue |
| `/admin/tutor-matching` | Admin matching diagnostics |
| `/admin/disputes` | Dispute resolution workbench |
| `/admin/bookings` | Booking search and detail view |
| `/admin/payments` | Transaction and wallet overview |
| `/admin/inquiries` | Inquiry and AI safety browser |
| `/admin/users` | User, student, and tutor directory |
| `/admin/audit` | Audit event log viewer |
| `/privacy`, `/terms`, `/cookies` | Legal pages |

## API Surface

| Area | Routes |
| --- | --- |
| Auth/profile | `/api/me`, `/api/student/profile`, `/api/tutor/profile` |
| Intake/uploads | `/api/uploads/presign`, `/api/inquiries`, `/api/inquiries/[id]` |
| AI | `/api/inquiries/[id]/ai`, `/api/inquiries/[id]/ai/job` |
| Tutor matching | `/api/tutors/nearby`, `/api/tutors/quote-requests` |
| Quotes | `/api/inquiries/[id]/quote-request`, `/api/quote-requests/[id]/quotes`, `/api/quotes/[id]/accept`, `/api/quotes/[id]/decline`, `/api/quotes/[id]/pdf` |
| Payments | `/api/tutors/connect/onboard`, `/api/quotes/[id]/checkout`, `/api/quotes/[id]/booking-status`, `/api/webhooks/stripe` |
| Bookings | `/api/bookings/[id]/cancel`, `/api/bookings/[id]/dispute`, `/api/bookings/[id]/resolve` |
| Tutor finance | `/api/tutors/wallet`, `/api/tutors/bookings`, `/api/tutors/quotes` |
| Admin — verification | `/api/admin/tutor-verifications`, `/api/admin/tutor-verifications/[id]` |
| Admin — matching | `/api/admin/tutor-matching/debug` |
| Admin — overview | `/api/admin/overview` |
| Admin — disputes | `/api/admin/disputes`, `/api/admin/disputes/[id]` |
| Admin — bookings | `/api/admin/bookings` |
| Admin — transactions | `/api/admin/transactions` |
| Admin — users | `/api/admin/users` |
| Admin — inquiries | `/api/admin/inquiries` |
| Admin — audit | `/api/admin/audit` |
| Notifications | `/api/notifications`, `/api/notifications/[id]/mark-read`, `/api/me/notification-preferences` |
| Platform | `/api/health`, `/api/docs` |

## Key Modules

- `lib/server/admin-queries.ts`: Admin dashboard aggregations and paginated
  queries for all admin workbenches.
- `lib/server/profiles.ts`: EduMatch role resolution and role guards.
- `lib/server/ai-orchestrator.ts`: multimodal AI processing and provider
  fallback.
- `lib/server/tutor-matching.ts`: PostGIS matching and ranking.
- `lib/server/quotes.ts`: quote request, submit, accept, and decline lifecycle.
- `lib/server/stripe.ts`: Connect onboarding, checkout, and webhook helpers.
- `lib/server/wallet.ts`: wallet accounting and payout invariants.
- `lib/server/pdf.ts`: quote PDF rendering and signed URL generation.
- `lib/server/email.ts`: transactional email delivery.
- `lib/server/moderation.ts`: academic-integrity and safety classification.
- `lib/server/bookings.ts`: booking cancellation, dispute, and resolution
  transitions.
- `lib/server/tutor-verification.ts`: tutor verification state transitions.
- `lib/server/notification-preferences.ts`: tutor/student notification settings.
- `lib/server/audit.ts`: append-only audit event recording for sensitive
  flows.

## Environment

```env
# App URLs
PORTAL_URL=http://localhost:3000
EDUMATCH_URL=http://localhost:3005
NEXT_PUBLIC_PORTAL_URL=http://localhost:3000

# Auth and database
DATABASE_URL=postgresql://...
AUTH_SECRET=...
AUTH_URL=http://localhost:3005
AUTH_TRUST_HOST=true
AUTH_COOKIE_DOMAIN=

# AI and queues
OPENAI_API_KEY=...
OPENAI_MODEL_VISION=gpt-4o
OPENAI_MODEL_CHAT=gpt-4o-mini
ANTHROPIC_API_KEY=...
REDIS_URL=redis://127.0.0.1:6379

# Geo and storage
GOOGLE_MAPS_API_KEY=...
SPACES_ENDPOINT=...
SPACES_BUCKET=...
SPACES_ACCESS_KEY_ID=...
SPACES_SECRET_ACCESS_KEY=...

# Payments and email
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
RESEND_API_KEY=...
```

## Data Model

EduMatch models live in `packages/db/prisma/schema.prisma`, including:

- `EduStudentProfile`, `EduTutorProfile`
- `EduInquiry`, `EduAiResponse`
- `EduQuoteRequest`, `EduQuote`, `EduBooking`
- `EduTransaction`, `EduWallet`
- `EduNotification`, `EduMessage`

Auth roles are derived at runtime:

- `STUDENT`: user has an `EduStudentProfile`.
- `TUTOR`: user has an `EduTutorProfile`.
- `ADMIN`: user has global `admin`, `superadmin`, or `edumatch_admin` RBAC role.

Admin access is enforced at two levels:
1. **Route guard** — `app/admin/layout.tsx` server-side checks redirect
   unauthenticated and non-admin users before rendering any admin UI.
2. **API guard** — all `/api/admin/*` routes use `requireRole("ADMIN")` from
   `lib/server/profiles.ts`, returning 401/403 JSON responses.

## Help Center

Local, dependency-light — no CMS or backend. All content lives in two files:

- `lib/help-content.ts` — the typed content model: one `HelpArticle` per
  guide (slug, audience, workflow route, ordered steps, related slugs, ...).
  Slugs are stable, language-neutral route segments — never translate them,
  and don't rename one without checking for links elsewhere in the app.
- `lib/i18n-dictionaries.ts` — every string an article references, under
  `edumatch.help.*` keys, once per base language (`en`, `nl`, `fr`, `de`,
  `lb`). A key referenced by `help-content.ts` that's missing from any of
  the five blocks fails `lib/__tests__/help-content.test.ts`.

**Adding a new article**: add a `HelpArticle` entry to `HELP_ARTICLES` in
`lib/help-content.ts`, then add every key it references (`titleKey`,
`summaryKey`, each step's `titleKey`/`bodyKey`, `troubleshootingKeys`, ...)
to all five language blocks in `lib/i18n-dictionaries.ts`. Run
`pnpm --filter edumatch test` — the translation-completeness tests catch a
missing key or language immediately rather than at runtime.

**Adding a visual**: `components/help/HelpVisual.tsx` holds a fixed set of
CSS/SVG mockups (`HelpVisualKind`), not screenshots — screenshots go stale
the moment a button label changes; these are built from `var(--color-*)`
tokens so they're correct in both themes automatically. Add a new `kind` to
`HelpVisualKind` in `lib/help-content.ts` and a matching component in
`HelpVisual.tsx` if an existing mockup doesn't fit a new step.

**Adding a contextual help link**: import `ContextualHelpLink` from
`components/help/ContextualHelpLink.tsx` and point its `href` at the most
relevant article — never bare `/help`. `lib/__tests__/contextual-help-links.test.ts`
pins the current set of screens and their target articles; add a row there
for any new placement so a future rename of the target article fails the
test instead of silently linking to nothing.

**Luxembourgish**: `lib/i18n-dictionaries.ts` has no general-purpose `lb`
block — non-Help content in `lb` already falls back to English per-key.
The Help Center's `lb` block is scoped to Help content specifically so it
doesn't do the same, and was written as a good-faith translation rather
than by a native speaker; treat it as a first pass pending native review,
not a finished translation.

**E2E**: `e2e/help-center.spec.ts` covers the signed-out-reachable flows
(search, filter, locale switch, article navigation). Two flows that start
from an authenticated screen are present but `test.skip`'d — this suite
has no working sign-in fixture yet (see the file's top comment); un-skip
them once one exists.

## Documentation Tasks

- Keep implementation status here.
- Keep milestones, risks, and release strategy in
  [docs/edumatch-project-plan.md](../../docs/edumatch-project-plan.md).
- When adding user-facing flows, update route maps and API docs together.

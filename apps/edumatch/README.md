# EduMatch

AI-first homework help and tutor marketplace. The web app, API routes, tutor
matching, payments, notification flows, and documentation live in this Next.js
app inside the ASafarIM Platform monorepo.

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

Verification baseline (2026-08-05): typecheck passes, 182 tests pass, and the
Next.js production build generates 65 routes.

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
| `/student` | Student dashboard |
| `/student/profile` | Student profile setup |
| `/student/inquiry/new` | Student inquiry intake |
| `/student/inquiry/[id]` | Inquiry detail and AI response |
| `/student/inquiry/[id]/quotes` | Tutor quote comparison |
| `/student/checkout/[quoteId]` | Booking checkout |
| `/student/booking/confirmation` | Payment confirmation |
| `/tutor` | Tutor dashboard |
| `/tutor/profile` | Tutor profile setup |
| `/tutor/requests` | Matching quote requests |
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
REDIS_URL=redis://localhost:6379

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

## Documentation Tasks

- Keep implementation status here.
- Keep milestones, risks, and release strategy in
  [docs/edumatch-project-plan.md](../../docs/edumatch-project-plan.md).
- When adding user-facing flows, update route maps and API docs together.

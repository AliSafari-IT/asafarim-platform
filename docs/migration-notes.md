# Migration Notes

## Upgrade to Next.js 16 (2026-07-06)

Bumped all four apps from Next.js 15.5.20 to **16.2.10** (React 19.0 →
19.2.7), matching the version already in production on
`asafarim-digital`'s portal app.

- **`middleware.ts` → `proxy.ts`** (Next 16 breaking change, the file and
  export are both renamed): `apps/hub/middleware.ts` and
  `apps/admin/middleware.ts` renamed to `proxy.ts`; the shared helper in
  `packages/auth` renamed from `middleware.ts`/`createAuthMiddleware` to
  `proxy.ts`/`createAuthProxy` (package export `./middleware` → `./proxy`)
  to match. Behavior is unchanged — same redirect/401/RBAC logic.
- Turbopack is now the default for `next dev` and `next build` (previously
  opt-in via `--turbopack`); no custom webpack config existed in any app,
  so no build failure and no script changes were needed.
- No other breaking changes from the v16 guide applied to this codebase:
  no `next/image`, no parallel routes, no AMP, no `next lint`, no
  `serverRuntimeConfig`, params/searchParams were already accessed async.
- **Verified**: `pnpm install` resolved cleanly (no peer conflicts with
  `next-auth@5.0.0-beta.28`); build 5/5 and typecheck 8/8 pass; full auth
  regression re-run against the renamed `proxy.ts` — logged-out redirects
  with `callbackUrl`, admin console access + live DB counts, cross-app SSO
  session (hub login recognized on admin), roleless user denial — all
  identical to pre-upgrade behavior; all public routes on web/showcase
  still 200.

## Migration record — PR #6: public website content (2026-07-05)

### Source notes

- `F:\repos\asafarim-digital` supplied the current product and platform
  vocabulary (Vionto, EduMatch, Content Generator, and Ops Hub), the portal/app
  registry as a structural reference, and the two selected brand assets. The
  old portal implementation was not copied.
- `D:\repos\asafarim-dot-be` supplied the English biography, education and
  experience facts, contact details, freelance service themes, showcase project
  summaries (Testora, SmartOps, Task Management, and Java Study Notes), and npm
  package descriptions. The primary reference was
  `apps/web/src/locales/web-en.json`.
- `D:\repos\asafarim` was reviewed for the older portfolio, project, blog, and
  CMS model. No page copy or assets were migrated from it; it informed the
  decision to defer database-backed content and the legacy blog system.

All imported ideas were rewritten in the Studio voice and adapted to the new
design system. The legal pages were newly written as informational placeholders
and remain flagged for professional review. Maintained content now lives in
`apps/web/content/` (`site.ts`, `services.ts`, `projects.ts`, and `legal.ts`)
instead of being embedded as large page-level data sets.

### Asset record

Migrated:

- `apps/web/public/favicon.svg`
- `apps/web/public/brand/logo-mark.svg`

Intentionally skipped:

- concept logos
- social banners
- user uploads and profile images
- generated and build assets
- unused legacy images

No legacy asset directory or other large asset folder was copied.

### Deferred from PR #6

- Hub dashboard functionality
- Admin management features
- Showcase project detail system
- Vionto app functionality
- EduMatch app functionality
- content-generator app functionality
- marketing-content app functionality
- blog/Docusaurus migration
- backend contact form handling
- database-backed project CMS
- resume/CV pages and publications

These belong to later, app-specific PRs; no Hub, Admin, or Showcase
functionality is included in PR #6.

---

# Phase 1 — Discovery

Inventory of the existing codebases, reviewed on 2026-07-05. Old code is a
reference only — nothing has been copied into the monorepo.

## Access notes

All three repositories were reachable from this machine:

| Repo | Path | Accessible | Notes |
| --- | --- | --- | --- |
| asafarim-digital | `F:\repos\asafarim-digital` | ✅ | Also mirrored at `C:\repos\asm\asafarim-digital` |
| asafarim-dot-be | `D:\repos\asafarim-dot-be` | ✅ | git required a `safe.directory` exception (repo owned by an old Windows user profile); added via `git config --global --add safe.directory D:/repos/asafarim-dot-be` |
| asafarim | `D:\repos\asafarim` | ✅ | Same `safe.directory` fix applied |

## Activity summary

| Repo | Last commit | Commits | Status |
| --- | --- | --- | --- |
| asafarim-digital | **2026-07-02** (3 days ago) | 588 | **Actively developed, deployed in production** |
| asafarim-dot-be | 2026-01-19 (~6 months) | 509 | Dormant |
| asafarim | 2025-08-08 (~11 months) | 599 | Abandoned / superseded |

---

## 1. `F:\repos\asafarim-digital` (v1.5.1)

### Purpose

Current-generation production monorepo for `*.asafarim.com`. **This repo
already implements most of what the migration plan describes** — it is a
pnpm + Turborepo monorepo with Next.js apps, shared Prisma/NextAuth packages,
Docker Compose deployment to a VPS, and cross-subdomain SSO.

### Framework / versions

- Next.js **16.2.3** (App Router), React 19, TypeScript 5.7, Tailwind CSS 4
- next-auth **v5 beta** (Auth.js) + bcryptjs
- Prisma + **PostgreSQL**, Redis (Vionto queue), Turborepo 2.9, pnpm 11.5
- Node >= 22

### Apps (7)

| App | Purpose | Dev port | Domain |
| --- | --- | --- | --- |
| `portal` | Main brand/freelancer website + auth + admin + profile + showcase routes | 3000 | portal.asafarim.com |
| `content-generator` | AI content generation (OpenAI/Anthropic) | 3001 | content-generator.asafarim.com |
| `ops-hub` | Internal operations dashboard | 3003 | ops-hub.asafarim.com |
| `marketing-content` | Marketing content management | 3004 | marketing-content.asafarim.com |
| `edumatch` | Educational matching platform (tutors/students, wallet, bookings) | 3005 | edumatch.asafarim.com |
| `vionto` (+ `vionto-worker`) | AI video script generation, Redis-backed worker, DigitalOcean Spaces storage | 3006 | vionto.asafarim.com |
| `mobile-next` | Mobile-oriented app (newer addition) | — | — |

Portal route groups: `(auth)`, `admin`, `api`, `profile`, `showcase`,
`verify-email` — i.e. portal already combines what the new plan splits into
`web`, `hub`, `admin`, and `showcase`.

### Shared packages (11)

`auth` (NextAuth v5 config, middleware, providers, cross-subdomain cookie),
`db` (Prisma schema + seeds), `ui` (components + brand tokens), `config`,
`types`, `location`, `shared-i18n`, `country-language-selector`, `payments`,
`vionto-schemas`, plus published npm package `@asafarim/navigation`.

### Database (Prisma + PostgreSQL, ~64 models)

- **Auth/RBAC core:** User, Account, Session, VerificationToken,
  EmailLoginCode, Role, Permission, UserRole, RolePermission, AuditLog
- **CMS/site:** SiteContent, NavItem, SiteSetting, AppRegistry, HealthCheck
- **SaaS/billing:** Tenant, Plan, Subscription, Invoice, FeatureFlag,
  FeatureFlagOverride, UsageMetric, LifecycleEvent, Cart, CartItem
- **Product-specific:** `Edu*` (14 models), `Vionto*` (13), `Content*` (6),
  `Marketing*` (2), GooglePhotosConnection, Automation(+Run)

### Auth / SSO

NextAuth v5 with: credentials (bcrypt), Google OAuth, **email OTP login codes**
(TTL + rate limiting), `AUTH_COOKIE_DOMAIN=.asafarim.com` for cross-subdomain
SSO, RBAC via Role/Permission join tables. This matches the migration plan's
Phase 5 almost exactly.

### Styling

Tailwind CSS 4 + shared brand tokens in `packages/ui`.

### Environment variables

`DATABASE_URL` (Postgres), `AUTH_SECRET`, `AUTH_COOKIE_DOMAIN`,
Google OAuth pair + callback, email OTP tuning vars, per-app public URLs
(`NEXT_PUBLIC_*_URL`), `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `REDIS_URL`,
DigitalOcean Spaces creds, ElevenLabs key. Secrets managed with
`@asafarim/envage` (age-encrypted `.env.age` committed to repo).

### Deployment

Docker Compose on VPS at `/var/repos/asafarim-digital`, **nginx** vhosts per
subdomain (not Caddy), one-command deploy via `pnpm deploy` (git push + ssh +
tmux + `docker compose up -d --build`), GitHub Actions CI, systemd units.

### Worth migrating

- `packages/auth` design (NextAuth v5 + OTP + cookie-domain SSO + RBAC) — the
  best starting point for the new `packages/auth`
- Prisma auth/RBAC/CMS model subset — matches the plan's target schema almost 1:1
- `packages/ui` brand tokens, `shared-i18n`, `country-language-selector`
- Portal's public pages/content as the basis for `apps/web`
- Deploy pipeline ideas (post-deploy prune, tmux detached deploy, envage)

### Rewrite / rethink

- Portal mixes public site + admin + profile + showcase in one app — the new
  plan intentionally splits these
- nginx configs → replaced by Caddy in the new plan

### Ignore for now

- Vionto, EduMatch, content-generator, marketing-content product verticals —
  live products; decide separately whether they stay in asafarim-digital or
  later join the platform as showcase/hub apps

---

## 2. `D:\repos\asafarim-dot-be`

### Purpose

Previous-generation ecosystem for `asafarim.be`: portfolio/publications site,
blog, dashboards, and many product experiments, with .NET backends and a
custom identity/SSO stack.

### Framework / versions

- Frontends: React 18 + TypeScript + **Vite** (not Next.js), Docusaurus blog,
  one Angular-legacy jobs UI
- Backends: **.NET 8** (Core.Api, Identity.Api with ASP.NET Identity, Ai.Api,
  TestAutomation.Api + SignalR, FreelanceToolkit.Api, KidCode.Api,
  Restaurant.Api, SmartPath.Api) + Node/Express TestRunner (TestCafe)
- pnpm workspace + .NET solution side by side

### Apps (11 frontends)

`web` (portfolio/publications, port 5175), `blog` (Docusaurus), `core-app`
(dashboard/resume), `ai-ui`, `identity-portal`, `jobs-ui`,
`test-automation-ui` ("Testora"), `freelance-toolkit-ui`, `kidcode-studio`,
`restaurant-ui`, `smartpath-ui`; plus showcases `SmartOperationsDashboard`
and `TaskManagement` (each API + client).

### Database

PostgreSQL via EF Core; three databases (`asafarim`, `jobs`, `shared_db`).

### Auth / SSO

Custom SSO across `*.asafarim.be` subdomains: Identity.Api (.NET, ASP.NET
Identity) + identity-portal frontend; repo contains extensive SSO test
scripts (`test-sso-v2.sh`, `test-auth-endpoints.sh`).

### Styling

Shared design tokens + theme packages (`shared-ui-react`, tokens, react-themes).

### Deployment

`deploy-production.sh`, systemd service units, nginx on VPS (asafarim.be).

### Worth migrating (as reference/content)

- **Content**: portfolio/publications pages, blog posts (Docusaurus →
  markdown is portable), resume/CV features from core-app
- Showcase candidates: TaskManagement, SmartOperationsDashboard, Testora,
  KidCode Studio — good material for `apps/showcase` project cards/case studies
- Domain knowledge from Identity.Api SSO (cookie/token flows across subdomains)

### Rewrite / rethink

- All frontends are Vite SPAs → the new platform is Next.js; port content, not code
- .NET APIs → plan prefers Next.js route handlers first; .NET only if clearly needed

### Ignore

- Angular legacy in jobs-ui, TestRunner/TestCafe infra, `.snapshots`, `.vs`,
  scattered root test scripts, `cookies.txt`/`hosts.txt` artifacts

---

## 3. `D:\repos\asafarim`

### Purpose

Oldest generation: single full-stack app (asafarim.com), .NET clean
architecture + React SPA. Superseded by the other two repos.

### Framework / versions

- .NET 9 clean architecture (Api / Application / Domain / Infrastructure /
  Presentation / Test), EF Core + **MySQL** (Pomelo), JWT auth, Serilog, Swagger
- Frontend: React + TypeScript + Vite + **Fluent UI**, **yarn** (violates
  pnpm-only convention)
- Clients: `asafarim-ui` (main), `asafarim-blog`, `asafarim-bibliography`,
  `asafarim-pbk`, `asafarim-cli`

### Database

MySQL 8 (the plan standardizes on PostgreSQL — schema not reusable as-is).

### Auth

JWT-based custom auth in .NET; SQL fix scripts in repo root
(`fix-corrupted-passwords.sql`, demo user scripts) suggest a painful history.

### Deployment

Shell publish scripts (`publish.be.sh`, `publish.com.sh`, `deploy_backend.sh`),
systemd + nginx (`server.be.conf`), `ui/public_html` static hosting.

### Worth migrating

- Possibly blog/bibliography **content** and any assets (images, CV data)
- Nothing at the code level

### Ignore

- Effectively everything: MySQL schema, JWT auth, Fluent UI frontend, yarn
  tooling, root-level SQL patch scripts, `packages-microsoft-prod.deb`,
  `[Unit].ini`, `#script#`

---

## Recommendation: app responsibilities

| New app | Source | Rationale |
| --- | --- | --- |
| `apps/web` | Recreate from **asafarim-digital portal** public pages + **dot-be web/core-app content** (portfolio, publications, resume) | Portal has the current brand + Next.js patterns; dot-be has the richest public content |
| `apps/hub` | New build; reuse **portal profile/account patterns** and dot-be core-app dashboard ideas | No old repo has a clean standalone hub — portal mixes it into the site |
| `apps/showcase` | New build; content from **dot-be showcases** (TaskManagement, SmartOps, Testora, KidCode) + digital's product cards | Old showcases are Vite SPAs; present them as case-study pages with live links first |
| `apps/admin` | Recreate from **portal `admin` routes** + digital's RBAC models | Only asafarim-digital has real admin + RBAC to model from |
| `packages/db` | Subset of **asafarim-digital Prisma schema** (auth/RBAC/CMS/showcase models only) | Proven in production, PostgreSQL, matches plan's target model list |
| `packages/auth` | Port of **asafarim-digital packages/auth** (NextAuth v5 + OTP + cookie SSO) | Already solves Phase 5 requirements including cross-subdomain SSO |

## Migration priority list

**Migrate first (proven, high value):**

1. `asafarim-digital` auth package design → `packages/auth` (Phase 5)
2. `asafarim-digital` Prisma auth/RBAC/CMS subset → `packages/db` (Phase 4)
3. `asafarim-digital` brand tokens + UI patterns → `packages/ui`
4. Portfolio/publications/resume **content** from dot-be → `apps/web` (Phase 6)

**Rewrite from scratch (concept good, code not portable):**

- Hub dashboard (concepts from portal profile + core-app)
- Showcase area (case-study pages for TaskManagement, SmartOps, Testora, KidCode)
- Admin panel (modeled on portal admin routes)
- Blog (decide: Next.js MDX in `apps/web` vs. keeping Docusaurus)

**Ignore / remove:**

- All of `D:\repos\asafarim` code (MySQL, JWT, Fluent UI, yarn)
- dot-be .NET APIs (unless a feature demands .NET later), Angular legacy,
  TestRunner infra
- Vite SPA codebases (content only, no code)

**Needs your decision:**

1. **Biggest question — relationship to `asafarim-digital`:** it is *active*
   (commit 3 days ago), *in production*, and already matches ~80% of the
   migration plan (pnpm/Turborepo/Next 16/Prisma/NextAuth SSO/Docker VPS).
   Is `asafarim-platform` (a) a clean rebuild that will eventually **replace**
   it, (b) a restructure **of** it (split portal into web/hub/admin/showcase),
   or (c) a separate platform living alongside it? This determines whether we
   port its auth/db packages nearly as-is or redesign.
2. What happens to the live products (Vionto, EduMatch, content-generator,
   marketing-content)? Stay in asafarim-digital, or become platform apps later?
3. Domains: plan says `asafarim.com` → `apps/web`, but portal currently lives
   at `portal.asafarim.com`. Confirm final domain mapping before Caddy setup.
4. Blog strategy: migrate dot-be Docusaurus content into `apps/web` (MDX) or
   keep a separate blog app?
5. dot-be used three Postgres databases (`asafarim`, `jobs`, `shared_db`);
   the plan says one database. Confirm single-database consolidation.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Monorepo Overview

**pnpm 11 + Turborepo 2** monorepo with three workspace groups:
- `apps/*` — 8 Next.js 16 applications (web, hub, showcase, admin, vionto, testora, appbuilder, edumatch)
- `packages/*` — 12 shared packages (`@asafarim/auth`, `@asafarim/db`, `@asafarim/ui`, etc.)
- `benchmarks/*` — 4 benchmark suites

All apps: Next.js 16 App Router, TypeScript 5.7, Tailwind CSS 4, React 19, Turbopack, standalone Docker output.

## Common Commands

```bash
# Start everything locally (handles Docker check, migrations, package builds)
pnpm dev

# Target a single app
pnpm --filter @asafarim/appbuilder dev
pnpm --filter @asafarim/appbuilder worker:dev   # background worker (BullMQ)

# Build / lint / typecheck / format
pnpm build
pnpm lint
pnpm typecheck
pnpm format

# Tests
pnpm test                                              # all packages (Vitest)
pnpm --filter @asafarim/appbuilder test               # unit tests
pnpm --filter @asafarim/appbuilder test:integration
pnpm --filter @asafarim/appbuilder e2e                # Playwright

# Shared platform database (Prisma + PostgreSQL)
pnpm db:generate       # regenerate Prisma client after schema changes
pnpm db:migrate        # prisma migrate dev (local)
pnpm db:migrate:deploy # prisma migrate deploy (CI/prod)
pnpm db:studio         # Prisma Studio GUI
pnpm db:seed           # seed RBAC roles + optional admin user

# AppBuilder's isolated database (Drizzle)
pnpm --filter @asafarim/appbuilder db:generate
pnpm --filter @asafarim/appbuilder db:migrate

# Local infrastructure (PostgreSQL × 3, Redis)
pnpm db:up             # docker compose up -d

# Environment secrets
pnpm env:encrypt:local    # encrypt .env → .env.age (safe to commit)
pnpm env:decrypt:local    # decrypt .env.age → .env (requires .age/key.txt)

# Production deployment
pnpm deploy:prod          # runs infra/scripts/deploy-prod.sh
```

## Architecture

### Authentication (Auth.js v5)
**Hub** (`apps/hub`, port 3001) is the central sign-in gateway. All other apps redirect unauthenticated users to Hub and share a cookie domain (`.asafarim.com` prod / `localhost` dev). Providers: Email+password (bcryptjs), Email OTP (nodemailer SMTP), Google OAuth. Sessions are JWT (no DB adapter). Auth logic lives in `packages/auth`.

### Database Strategy
Two ORM layers coexist to avoid schema conflicts:
- **Prisma 7** (`packages/db`) — shared platform schema (users, RBAC, audit logs, etc.). Used by: web, hub, showcase, admin, vionto.
- **Drizzle ORM** — isolated per-app schemas. **Testora** (`port 55434`) and **AppBuilder** (`port 55436`) each have their own Postgres instance. Never mix these with the platform DB.

### Background Workers (BullMQ + Redis)
Two apps run persistent background workers alongside the Next.js server:
- **Vionto** — `vionto-worker`: FFmpeg video render pipeline (image → album → version → render → S3 export)
- **AppBuilder** — `appbuilder-worker`: AI generation pipeline (Zod-validated, structured output, durable job model)

In dev, `pnpm dev` spawns both worker processes via `turbo worker:dev`.

### Shared Packages
| Package | Purpose |
|---|---|
| `@asafarim/auth` | Auth.js config, middleware, RBAC helpers |
| `@asafarim/db` | Prisma client + schema + migrations + seed |
| `@asafarim/ui` | Design system: CSS tokens, brand components |
| `@asafarim/storage` | S3-compatible object storage (AWS SDK v3) |
| `@asafarim/appbuilder-schema` | Versioned app spec contract + Zod schemas |
| `@asafarim/appbuilder-ai` | Server-only AI provider boundary (OpenAI/Anthropic) |
| `@asafarim/appbuilder-runtime` | Metadata-driven preview renderer (no DB/auth deps) |
| `@asafarim/theme-toggle` | Light/dark mode; writes `data-theme` on `<html>` |
| `@asafarim/vionto-schemas` | Zod validation schemas for Vionto |

### Theming
`@asafarim/ui` uses CSS design tokens in `styles/tokens.css`. Per-app theming is applied via the `data-app` attribute. Never use `window.confirm` / `window.alert` — use the styled `ConfirmDialog` component instead.

### Turbo Task Graph
Builds depend on `^build` (packages must build before apps). When you change a shared package, its `dist/` must be regenerated before the consuming app can see changes. `@asafarim/db#build` has `cache: false` (Prisma generate output varies). Dev/worker tasks are persistent watch modes.

### Environment Secrets
- `.env` / `.env.production` — decrypted, git-ignored
- `.env.age` / `.env.production.age` — encrypted, committed
- `.age/key.pub` — recipient key (committed); `.age/key.txt` — private key (never committed)
- Key sections: `DATABASE_URL`, `AUTH_SECRET`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, S3 credentials, SMTP config, per-app `*_DATABASE_URL`
- in production, `.env.production` is regenerated from the encrypted `.env.production.age` (tracked in git) via `envage/age`. So editing `.env.production` directly is futile — it gets overwritten on the next decrypt.

### App Ports
| App | Local Port | Domain |
|---|---|---|
| web | 3000 | asafarim.com |
| hub | 3001 | hub.asafarim.com |
| showcase | 3002 | showcase.asafarim.com |
| admin | 3003 | admin.asafarim.com |
| vionto | 3004 | vionto.asafarim.com |
| testora | 3005 | testora.asafarim.com |
| appbuilder | 3006 | appbuilder.asafarim.com |
| edumatch | 3009 | edumatch.asafarim.com |
| timelineai | 3010 | tlai.asafarim.com |

### Production Deployment
Docker Compose + Caddy reverse proxy on Hostinger VPS (`82.25.116.73`). GitHub Actions (`push to main`) SSH into VPS and runs `infra/scripts/vps-deploy.sh`, which: decrypts env, builds images sequentially (memory-safe on 8 GB), restarts stack, notifies Discord.

## Key Docs
- `docs/architecture.md` — Cross-app communication, RBAC layers, protection model
- `docs/appbuilder-architecture.md` — AppBuilder M01–M12 roadmap, route contracts, security model
- `docs/appbuilder-m13-public-references.md` — SSRF policy, provenance/freshness, cache TTL, GitHub adapter
- `docs/environment-management.md` — Encryption workflow, key rotation, CI procedures
- `docs/design-system.md` — UI tokens, mood system, brand components


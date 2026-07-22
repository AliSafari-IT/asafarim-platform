# ASafarIM Web (asafarim.com)

The public **ASafarIM Digital** website — the marketing-facing, systems-minded studio site that introduces the platform, showcases work, and explains the full-stack & AI application studio offering. Copy and branding are centralized in `content/site.ts`; translations live in `lib/i18n-dictionaries.ts`.

## Development

```bash
pnpm --filter @asafarim/web dev
```

Local URL: `http://localhost:3000`

The app reads shared environment variables from the repo-root `.env`/`.env.local`. See `.env.local.example` for the `NEXT_PUBLIC_*` variables used by the web app (`NEXT_PUBLIC_WEB_URL`, `NEXT_PUBLIC_HUB_URL`, etc.).

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS
- **Auth:** Auth.js v5 (shared via `@asafarim/auth` for any protected pages)
- **Content:** `apps/web/content/site.ts` for global copy, `apps/web/lib/i18n-dictionaries.ts` for locale strings
- **Shared packages:** `@asafarim/ui`, `@asafarim/auth`, `@asafarim/shared-i18n`, `@asafarim/theme-toggle`, `@asafarim/storage`

## Content Structure

- `content/site.ts` — site name, title, description, hero, principles, and SEO defaults
- `app/page.tsx` — homepage with hero, projects, stats, and call-to-action sections
- `lib/i18n-dictionaries.ts` — `en`, `nl`, `fr`, `de`, `lb` locale dictionaries for the web app
- `app/about`, `app/contact`, `app/projects`, `app/services`, `app/privacy`, `app/terms` — public pages

## Deployment

Built from `apps/web/Dockerfile` (Next.js standalone) and proxied by Caddy at `https://asafarim.com` as part of `docker-compose.prod.yml`.

## Related

- [Platform README](../../README.md)
- [Architecture docs](../../docs/architecture.md)
- [Migration plan](../../docs/migration-plan.md)

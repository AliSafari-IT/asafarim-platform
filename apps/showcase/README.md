# ASafarIM Showcase

Public gallery of real software built on the platform — project
write-ups, architecture diagrams, and live links to running apps. Lives
at [showcase.asafarim.com](https://showcase.asafarim.com), local dev on
port **3002**.

## What's here

- **Project gallery** (`/projects`) — one card per project, each linking
  to a detailed write-up and the live app when deployed. Projects include
  Vionto, EduMatch, Testora, and an AI evaluation lab.
- **Project detail pages** (`/projects/[slug]`) — architecture diagrams,
  dependency matrices, stack breakdowns, and "what works vs what's
  synthetic" honesty sections driven by `ShowcaseAbout` from `@asafarim/ui`.
- **Labs** (`/labs`) — experimental prototypes and explorations.
- **i18n** — full locale support via `@asafarim/shared-i18n` with
  dictionaries in `lib/i18n-dictionaries.ts` (en, nl, fr, de, lb).

## Stack

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS
- `@asafarim/ui` for the design system (`Hero`, `Section`,
  `ProjectCard`, `ShowcaseAbout`, `ShowcaseNotice`,
  `PipelineDiagram`, `PlatformMap`)
- `@asafarim/shared-i18n` for locale resolution and server-side
  translation
- `@asafarim/country-language-selector` for the locale picker
- `@asafarim/auth` for session awareness (public app, no login required)

## Development

```bash
pnpm --filter @asafarim/showcase dev      # http://localhost:3002
pnpm --filter @asafarim/showcase build
pnpm --filter @asafarim/showcase typecheck
```

### Project data

Project entries are defined in `app/projects/data.ts` — each project
declares its slug, stack, platform dependencies (referencing
`PLATFORM_ELEMENTS`), what works end-to-end, and what's synthetic. The
architecture diagram and coverage matrix on each project page render
from this data.

### Environment

Showcase reads the shared root `.env.local`. Key variables:
`NEXT_PUBLIC_*_URL` for linking to live apps, `NEXT_PUBLIC_HUB_URL` for
the sign-in link in the nav.

## Deployment

Part of `docker-compose.prod.yml` — `showcase` service, proxied by Caddy
at `https://showcase.asafarim.com`. Built and deployed via
`infra/scripts/vps-deploy.sh`.

# AppBuilder

Metadata-driven AI application factory (`appbuilder.asafarim.com`). Users
describe an internal business application, receive a controlled/versioned
application specification, preview it at `/apps/{appId}/preview`, refine it
conversationally, validate it, and publish an immutable release.

This is **M01** of the delivery series tracked in
[issue #29](https://github.com/AliSafari-IT/asafarim-platform/issues/29):
the architecture contract, app scaffold, and local runtime. See
[docs/adr/0001-appbuilder-managed-runtime.md](../../docs/adr/0001-appbuilder-managed-runtime.md)
for the architectural decision this scaffold builds on, and
[docs/appbuilder-architecture.md](../../docs/appbuilder-architecture.md) for
the route contracts and milestone map.

## What's here (M01)

- Next.js 16 App Router shell using `@asafarim/ui` directly (no forked
  components).
- Route contracts: `/`, `/apps`, `/apps/new`, `/apps/[appId]`,
  `/apps/[appId]/preview` — each a defined page, not a 404, with the real
  behavior arriving in later milestones (noted inline on each page).
- `GET /api/health` liveness endpoint.
- `loading.tsx` / `error.tsx` / `not-found.tsx` using the shared
  `EmptyState` / `Alert` primitives.

## What's explicitly not here yet

- Database persistence and the app registry (M02).
- Platform SSO / authorization (M03).
- The versioned specification format and operation engine (M04).
- AI generation, the template/component registry, and the preview runtime
  (M05–M07).
- Production routing / deployment wiring (M11).

## Development

```bash
pnpm --filter @asafarim/appbuilder dev      # http://localhost:3006
pnpm --filter @asafarim/appbuilder build
pnpm --filter @asafarim/appbuilder typecheck
pnpm --filter @asafarim/appbuilder lint
pnpm --filter @asafarim/appbuilder test
```

Or run everything (including this app) via the monorepo root `pnpm dev`.

## Docker

```bash
docker build -f apps/appbuilder/Dockerfile -t appbuilder .
docker run --rm -p 3006:3000 appbuilder
curl http://localhost:3006/api/health
```

Not yet wired into `docker-compose.prod.yml` / Caddy — that's production
routing, explicitly deferred to M11.

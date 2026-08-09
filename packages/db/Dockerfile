# ---------------------------------------------------------------------------
# @asafarim/db — one-shot migration/seed job for the SHARED platform database.
#
# Every other app image in this stack serves traffic; this one exists purely
# to bring the schema up to date before those apps start. Until it existed,
# `prisma migrate deploy` against the platform database was a manual host-side
# step (`pnpm db:migrate:deploy:prod`) that a deploy could silently skip —
# which is exactly how the TimelineAI tables ended up missing in production
# while the app that queries them was live and 500ing.
#
# Deliberately NOT folded into an app's Dockerfile: the platform schema is
# shared by web, hub, showcase, admin, vionto, and timelineai, so it doesn't
# belong to any one of them. Compare testora/appbuilder, whose migrators live
# in their own Dockerfiles because those databases are app-private.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS migrator
WORKDIR /app
RUN corepack enable

# The full workspace is copied so pnpm can validate the lockfile against every
# workspace package, but only @asafarim/db's dependency graph is installed —
# this job needs prisma + tsx and nothing else, and a full workspace install
# would add minutes to a deploy that already builds 13 images sequentially on
# an 8GB box.
COPY . .
RUN pnpm install --frozen-lockfile --filter @asafarim/db...

# DATABASE_URL is supplied by compose and points at the in-network `postgres`
# service. Migrations run first and always; the TimelineAI demo seed runs only
# when the table is empty (see db:deploy:migrate-and-seed).
CMD ["pnpm", "--filter", "@asafarim/db", "db:deploy:migrate-and-seed"]

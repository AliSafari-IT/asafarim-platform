FROM node:24-alpine AS builder
WORKDIR /app
ENV COREPACK_HOME=/usr/local/share/corepack
# Dependencies are installed once, at build time, with --frozen-lockfile.
# pnpm must never re-verify and reinstall them at container start: running
# as `node`, it resolves a different ($HOME-based) store than the build-time
# install and tries to wipe the root-owned node_modules, so every pnpm-run
# stage (migrators, workers) fails with ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR.
ENV pnpm_config_verify_deps_before_run=false
RUN corepack enable
ARG NEXT_PUBLIC_WEB_URL=https://asafarim.com
ARG NEXT_PUBLIC_HUB_URL=https://hub.asafarim.com
ARG NEXT_PUBLIC_SHOWCASE_URL=https://showcase.asafarim.com
ARG NEXT_PUBLIC_ADMIN_URL=https://admin.asafarim.com
ARG NEXT_PUBLIC_VIONTO_URL=https://vionto.asafarim.com
ARG NEXT_PUBLIC_EDUMATCH_URL=https://edumatch.asafarim.com
ARG NEXT_PUBLIC_TESTORA_URL=https://testora.asafarim.com
ARG NEXT_PUBLIC_APPBUILDER_URL=https://appbuilder.asafarim.com
ARG NEXT_PUBLIC_TIMELINEAI_URL=https://tlai.asafarim.com
ARG NEXT_PUBLIC_DEVTOOLS_URL=https://asafarim.be
ARG NEXT_PUBLIC_LABS_URL=https://labs.asafarim.com
ARG NEXT_PUBLIC_RESUMATCH_URL=https://resumatch.asafarim.com
ARG NEXT_PUBLIC_TASKSAI_URL=https://tasks-ai.asafarim.com
ARG NEXT_PUBLIC_API_URL=https://api.asafarim.com
ENV NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_HUB_URL=$NEXT_PUBLIC_HUB_URL \
    NEXT_PUBLIC_SHOWCASE_URL=$NEXT_PUBLIC_SHOWCASE_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_VIONTO_URL=$NEXT_PUBLIC_VIONTO_URL \
    NEXT_PUBLIC_EDUMATCH_URL=$NEXT_PUBLIC_EDUMATCH_URL \
    NEXT_PUBLIC_TESTORA_URL=$NEXT_PUBLIC_TESTORA_URL \
    NEXT_PUBLIC_APPBUILDER_URL=$NEXT_PUBLIC_APPBUILDER_URL \
    NEXT_PUBLIC_TIMELINEAI_URL=$NEXT_PUBLIC_TIMELINEAI_URL \
    NEXT_PUBLIC_DEVTOOLS_URL=$NEXT_PUBLIC_DEVTOOLS_URL \
    NEXT_PUBLIC_LABS_URL=$NEXT_PUBLIC_LABS_URL \
    NEXT_PUBLIC_RESUMATCH_URL=$NEXT_PUBLIC_RESUMATCH_URL \
    NEXT_PUBLIC_TASKSAI_URL=$NEXT_PUBLIC_TASKSAI_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BUILD_STANDALONE=true
# The full-workspace install pulls in edumatch's puppeteer dependency; this
# app has no use for it, so skip the Chrome download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
# ResuMatch's Prisma client is generated into the app (lib/db/generated), not
# node_modules, so it must be generated before the Next.js build type-checks.
RUN pnpm --filter @asafarim/resumatch db:generate
RUN pnpm --filter @asafarim/resumatch build

# One-shot migration job. Runs to completion before the app starts, so a
# deploy cannot ship a ResuMatch whose tables were never created.
FROM node:24-alpine AS migrator
WORKDIR /app
ENV COREPACK_HOME=/usr/local/share/corepack
# Dependencies are installed once, at build time, with --frozen-lockfile.
# pnpm must never re-verify and reinstall them at container start: running
# as `node`, it resolves a different ($HOME-based) store than the build-time
# install and tries to wipe the root-owned node_modules, so every pnpm-run
# stage (migrators, workers) fails with ERR_PNPM_PACKAGE_MANAGER_REMOVE_MODULES_DIR.
ENV pnpm_config_verify_deps_before_run=false
RUN corepack enable
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/resumatch
USER node
CMD ["pnpm", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder --chown=node:node /app/apps/resumatch/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/resumatch/.next/static ./apps/resumatch/.next/static
COPY --from=builder --chown=node:node /app/apps/resumatch/public ./apps/resumatch/public
EXPOSE 3000
USER node
CMD ["node", "apps/resumatch/server.js"]

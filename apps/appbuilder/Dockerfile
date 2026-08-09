# ---------------------------------------------------------------------------
# appbuilder — metadata-driven AI application factory. Stages:
#   builder  : installs the whole workspace and builds the standalone server.
#   migrator : reuses builder (has tsx + drizzle + source) to run drizzle
#              migrations against appbuilder's own database before the app
#              starts. See docker-compose.prod.yml's appbuilder-migrate job.
#   runner   : slim image that serves the app.
#   worker   : bundles worker.ts (M07 AI generation worker — a separate
#              process from the Next.js app, see docs/appbuilder-m07-ai-generation.md)
#              and installs only its external runtime deps into a slim image.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
# NEXT_PUBLIC_* are inlined into client bundles at build time. Provided by
# compose's public-build-args once appbuilder joins docker-compose.prod.yml
# (production routing/deployment ships in M11).
ARG NEXT_PUBLIC_COMPANY_NAME="ASafarIM Digital"
ARG NEXT_PUBLIC_PLATFORM_NAME="ASafarIM Platform"
ARG NEXT_PUBLIC_WEB_URL=https://asafarim.com
ARG NEXT_PUBLIC_HUB_URL=https://hub.asafarim.com
ARG NEXT_PUBLIC_SHOWCASE_URL=https://showcase.asafarim.be
ARG NEXT_PUBLIC_ADMIN_URL=https://admin.asafarim.com
ARG NEXT_PUBLIC_VIONTO_URL=https://vionto.asafarim.com
ARG NEXT_PUBLIC_EDUMATCH_URL=https://edumatch.asafarim.com
ARG NEXT_PUBLIC_TESTORA_URL=https://testora.asafarim.com
ARG NEXT_PUBLIC_APPBUILDER_URL=https://appbuilder.asafarim.com
ARG NEXT_PUBLIC_TIMELINEAI_URL=https://tlai.asafarim.com
ARG NEXT_PUBLIC_DEVTOOLS_URL=https://asafarim.be
ARG NEXT_PUBLIC_API_URL=https://api.asafarim.com
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_PLATFORM_NAME=$NEXT_PUBLIC_PLATFORM_NAME \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_HUB_URL=$NEXT_PUBLIC_HUB_URL \
    NEXT_PUBLIC_SHOWCASE_URL=$NEXT_PUBLIC_SHOWCASE_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_VIONTO_URL=$NEXT_PUBLIC_VIONTO_URL \
    NEXT_PUBLIC_EDUMATCH_URL=$NEXT_PUBLIC_EDUMATCH_URL \
    NEXT_PUBLIC_TESTORA_URL=$NEXT_PUBLIC_TESTORA_URL \
    NEXT_PUBLIC_APPBUILDER_URL=$NEXT_PUBLIC_APPBUILDER_URL \
    NEXT_PUBLIC_TIMELINEAI_URL=$NEXT_PUBLIC_TIMELINEAI_URL \
    NEXT_PUBLIC_DEVTOOLS_URL=$NEXT_PUBLIC_DEVTOOLS_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BUILD_STANDALONE=true
# The full-workspace install below pulls in edumatch's puppeteer
# dependency (pnpm-workspace.yaml approves its postinstall script); this
# app has no use for it, so skip the Chrome/chrome-headless-shell download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asafarim/appbuilder build

# --- migration runner (one-shot; started by docker compose before the app) ---
FROM builder AS migrator
# Default command applies pending drizzle migrations. APPBUILDER_DATABASE_URL
# is supplied by compose (points at the in-network appbuilder-postgres).
CMD ["pnpm", "--filter", "@asafarim/appbuilder", "db:migrate"]

# --- app server ---
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/appbuilder/.next/standalone ./
COPY --from=builder /app/apps/appbuilder/.next/static ./apps/appbuilder/.next/static
COPY --from=builder /app/apps/appbuilder/public ./apps/appbuilder/public
EXPOSE 3000
CMD ["node", "apps/appbuilder/server.js"]

# --- worker builder (bundles worker.ts + workspace packages via tsup) ---
FROM builder AS worker-builder
RUN pnpm --filter @asafarim/appbuilder worker:build

# --- worker (M07 generation/modification worker + M10 validation/repair
# worker; not the Next.js app). Debian-based (not alpine): M10's
# browser-driven validation gates (lib/validation/smoke/harness.ts) launch
# Chromium via playwright-core, which Playwright does not support on
# musl/Alpine — see docs/appbuilder-m10-validation-qa.md#operator-troubleshooting.
FROM node:24-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=worker-builder /app/apps/appbuilder/worker-dist ./worker-dist
# Only the deps tsup.worker.config.ts keeps external (native/heavy — bundled
# workspace packages like @asafarim/appbuilder-ai are already inlined).
# playwright-core/@axe-core/playwright back M10's browser-driven gates.
# drizzle-orm/next-auth/react/zod are externalized by tsup (see
# tsup.worker.config.ts) and so must be installed here too.
RUN npm install --no-save --omit=dev bullmq@^5.34.0 ioredis@^5.11.1 openai@^4.73.0 pg@^8.13.1 playwright-core@^1.60.0 @axe-core/playwright@^4.10.1 drizzle-orm@^0.38.2 next-auth@^5.0.0-beta.28 react@^19.2.7 zod@^3.24.1
RUN npx playwright install --with-deps chromium
EXPOSE 3008
CMD ["node", "worker-dist/worker.js"]

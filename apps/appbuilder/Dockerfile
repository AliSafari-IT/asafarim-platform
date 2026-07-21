# ---------------------------------------------------------------------------
# appbuilder — metadata-driven AI application factory. Two-stage:
#   builder : installs the whole workspace and builds the standalone server.
#   runner  : slim image that serves the app.
# No database or migration stage yet — appbuilder's own Postgres service
# ships in M02.
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
ARG NEXT_PUBLIC_TESTORA_URL=https://testora.asafarim.com
ARG NEXT_PUBLIC_APPBUILDER_URL=https://appbuilder.asafarim.com
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_PLATFORM_NAME=$NEXT_PUBLIC_PLATFORM_NAME \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_HUB_URL=$NEXT_PUBLIC_HUB_URL \
    NEXT_PUBLIC_SHOWCASE_URL=$NEXT_PUBLIC_SHOWCASE_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_VIONTO_URL=$NEXT_PUBLIC_VIONTO_URL \
    NEXT_PUBLIC_TESTORA_URL=$NEXT_PUBLIC_TESTORA_URL \
    NEXT_PUBLIC_APPBUILDER_URL=$NEXT_PUBLIC_APPBUILDER_URL
ENV BUILD_STANDALONE=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asafarim/appbuilder build

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

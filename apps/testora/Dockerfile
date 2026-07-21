# ---------------------------------------------------------------------------
# testora — E2E test-automation app. Multi-stage:
#   builder  : installs the whole workspace and builds the standalone server.
#   migrator : reuses builder (has tsx + drizzle + source) to run drizzle
#              migrations against testora's own database before the app starts.
#   runner   : slim image that serves the app. Ships chromium so the in-app
#              TestCafe runner can drive a headless browser.
# ---------------------------------------------------------------------------
FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
ENV BUILD_STANDALONE=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter testora build

# --- migration runner (one-shot; started by docker compose before the app) ---
FROM builder AS migrator
# Default command applies pending drizzle migrations. TESTORA_DATABASE_URL is
# supplied by compose (points at the in-network testora-postgres).
CMD ["pnpm", "--filter", "testora", "db:migrate"]

# --- app server ---
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Chromium for the in-app TestCafe runner. testcafe launches the browser from
# the server process, so a real chromium binary must be present.
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont
ENV CHROME_BIN=/usr/bin/chromium-browser
ENV E2E_BROWSER="path:/usr/bin/chromium-browser:--headless --no-sandbox --disable-gpu --disable-dev-shm-usage"

COPY --from=builder /app/apps/testora/.next/standalone ./
COPY --from=builder /app/apps/testora/.next/static ./apps/testora/.next/static
EXPOSE 3000
CMD ["node", "apps/testora/server.js"]

FROM node:24-alpine AS builder
WORKDIR /app
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
ARG NEXT_PUBLIC_JOBMATCH_URL=https://jobmatch.asafarim.com
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
    NEXT_PUBLIC_JOBMATCH_URL=$NEXT_PUBLIC_JOBMATCH_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BUILD_STANDALONE=true
# The full-workspace install pulls in edumatch's puppeteer dependency; this
# app has no use for it, so skip the Chrome download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
# JobMatch's Prisma client is generated into the app (lib/db/generated), not
# node_modules, so it must be generated before the Next.js build type-checks.
RUN pnpm --filter @asafarim/jobmatch db:generate
RUN pnpm --filter @asafarim/jobmatch build

# One-shot migration job. Runs to completion before the app starts, so a
# deploy cannot ship a JobMatch whose tables were never created.
FROM node:24-alpine AS migrator
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/jobmatch
CMD ["pnpm", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/jobmatch/.next/standalone ./
COPY --from=builder /app/apps/jobmatch/.next/static ./apps/jobmatch/.next/static
COPY --from=builder /app/apps/jobmatch/public ./apps/jobmatch/public
EXPOSE 3000
CMD ["node", "apps/jobmatch/server.js"]

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
    NEXT_PUBLIC_JOBMATCH_URL=$NEXT_PUBLIC_JOBMATCH_URL \
    NEXT_PUBLIC_TASKSAI_URL=$NEXT_PUBLIC_TASKSAI_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BUILD_STANDALONE=true
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
# The TasksAI Prisma client is generated into the app (lib/db/generated),
# not node_modules, so it must exist before the Next.js build type-checks.
RUN pnpm --filter @asafarim/tasks-ai db:generate
RUN pnpm --filter @asafarim/tasks-ai build

# One-shot migration job. Runs to completion before the app starts, so a
# deploy cannot ship a TasksAI whose tables were never created.
FROM node:24-alpine AS migrator
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
WORKDIR /app/apps/tasks-ai
CMD ["pnpm", "exec", "prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]

# Background worker (BullMQ). Same image contents as the runner, different
# entrypoint.
FROM node:24-alpine AS worker
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asafarim/tasks-ai db:generate
WORKDIR /app/apps/tasks-ai
CMD ["pnpm", "exec", "tsx", "worker/index.ts"]

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/tasks-ai/.next/standalone ./
COPY --from=builder /app/apps/tasks-ai/.next/static ./apps/tasks-ai/.next/static
COPY --from=builder /app/apps/tasks-ai/public ./apps/tasks-ai/public
EXPOSE 3000
CMD ["node", "apps/tasks-ai/server.js"]

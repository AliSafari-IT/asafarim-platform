FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable

ARG NEXT_PUBLIC_COMPANY_NAME="ASafarIM Digital"
ARG NEXT_PUBLIC_PLATFORM_NAME="ASafarIM Platform"
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
    NEXT_PUBLIC_LABS_URL=$NEXT_PUBLIC_LABS_URL \
    NEXT_PUBLIC_JOBMATCH_URL=$NEXT_PUBLIC_JOBMATCH_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    PUPPETEER_SKIP_DOWNLOAD=true \
    BUILD_STANDALONE=true

COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter edumatch build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/edumatch/.next/standalone ./
COPY --from=builder /app/apps/edumatch/.next/static ./apps/edumatch/.next/static
COPY --from=builder /app/apps/edumatch/public ./apps/edumatch/public
EXPOSE 3000
CMD ["node", "apps/edumatch/server.js"]

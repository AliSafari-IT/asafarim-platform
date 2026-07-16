FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_COMPANY_NAME="ASafarIM Digital"
ARG NEXT_PUBLIC_PLATFORM_NAME="ASafarIM Platform"
ARG NEXT_PUBLIC_HUB_NAME="ASafarIM Hub"
ARG NEXT_PUBLIC_WEB_URL=https://asafarim.com
ARG NEXT_PUBLIC_HUB_URL=https://hub.asafarim.com
ARG NEXT_PUBLIC_SHOWCASE_URL=https://showcase.asafarim.be
ARG NEXT_PUBLIC_ADMIN_URL=https://admin.asafarim.com
ARG NEXT_PUBLIC_API_URL=https://api.asafarim.com
ENV NEXT_PUBLIC_COMPANY_NAME=$NEXT_PUBLIC_COMPANY_NAME \
    NEXT_PUBLIC_PLATFORM_NAME=$NEXT_PUBLIC_PLATFORM_NAME \
    NEXT_PUBLIC_HUB_NAME=$NEXT_PUBLIC_HUB_NAME \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NEXT_PUBLIC_HUB_URL=$NEXT_PUBLIC_HUB_URL \
    NEXT_PUBLIC_SHOWCASE_URL=$NEXT_PUBLIC_SHOWCASE_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV BUILD_STANDALONE=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asafarim/hub build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/hub/.next/standalone ./
COPY --from=builder /app/apps/hub/.next/static ./apps/hub/.next/static
COPY --from=builder /app/apps/hub/public ./apps/hub/public
EXPOSE 3000
CMD ["node", "apps/hub/server.js"]

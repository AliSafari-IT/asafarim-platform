FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
ENV BUILD_STANDALONE=true
# The full-workspace install below pulls in edumatch's puppeteer
# dependency (pnpm-workspace.yaml approves its postinstall script); this
# app has no use for it, so skip the Chrome/chrome-headless-shell download.
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asafarim/labs build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/labs/.next/standalone ./
COPY --from=builder /app/apps/labs/.next/static ./apps/labs/.next/static
COPY --from=builder /app/apps/labs/public ./apps/labs/public
EXPOSE 3000
CMD ["node", "apps/labs/server.js"]

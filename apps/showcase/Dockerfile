FROM node:24-alpine AS builder
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @asafarim/showcase build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/apps/showcase/.next/standalone ./
COPY --from=builder /app/apps/showcase/.next/static ./apps/showcase/.next/static
COPY --from=builder /app/apps/showcase/public ./apps/showcase/public
EXPOSE 3000
CMD ["node", "apps/showcase/server.js"]

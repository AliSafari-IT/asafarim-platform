# Deployment

## Target

One command from the local machine deploys the whole platform to the VPS:

```bash
pnpm deploy:prod
```

This runs [infra/scripts/deploy-prod.sh](../infra/scripts/deploy-prod.sh),
which SSHes into the VPS, pulls the latest `main`, and rebuilds the Docker
Compose stack.

## One-time VPS setup

1. Install Docker + Docker Compose plugin and git.
2. Clone the repo:

   ```bash
   git clone https://github.com/AliSafari-IT/asafarim-platform.git /srv/asafarim-platform
   ```

3. Create `.env.production` locally from
   [.env.production.example](../.env.production.example), set the real domains,
   `AUTH_COOKIE_DOMAIN=.asafarim.com`, and the in-network database host
   (`postgres:5432`), then run `pnpm env:encrypt:production`. Commit only
   `.env.production.age`.
4. Provision `.age/key.txt` at `/srv/asafarim-platform/.age/key.txt` through a
   password manager or secrets vault. Never copy it into Git, a Docker image,
   CI logs, or email. The deploy script decrypts `.env.production.age` on the
   VPS immediately before Docker Compose starts.
5. Point DNS for all domains (see docs/architecture.md) at the VPS IP. Caddy
   obtains SSL certificates automatically once DNS resolves.

## Configure the deploy script

Edit `infra/scripts/deploy-prod.sh` and set:

```bash
SERVER_USER="root"            # or a dedicated deploy user
SERVER_HOST="YOUR_VPS_IP_OR_DOMAIN"
```

SSH key access to the VPS is required.

## Manual deployment (on the VPS)

```bash
cd /srv/asafarim-platform
git pull origin main
corepack enable
pnpm install --frozen-lockfile
pnpm env:decrypt:production
docker compose --env-file .env.production -f docker-compose.prod.yml \
  up -d --build --remove-orphans
```

## Stack

- `postgres` — PostgreSQL 16 with a named volume for data.
- `web`, `hub`, `showcase`, `admin` — Next.js standalone builds, one container
  each, built from the app Dockerfiles with the repo root as build context.
- `.dockerignore` excludes all plaintext environments and `.age` keys from the
  build context. Only `NEXT_PUBLIC_*` values enter builds through explicit
  Docker build arguments. Hub and Admin receive server-side production values
  at runtime through `.env.production`.
- `caddy` — reverse proxy on ports 80/443, config in
  [infra/caddy/Caddyfile](../infra/caddy/Caddyfile), automatic HTTPS.

## Database migrations

Once `packages/db` has a real Prisma setup (Phase 4), the deploy script will
also run:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T hub \
  pnpm --filter @asafarim/db prisma migrate deploy
```

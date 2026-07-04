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

3. Create the production env file at `/srv/asafarim-platform/.env` based on
   [.env.example](../.env.example). Never commit real `.env` files.
4. Point DNS for all domains (see docs/architecture.md) at the VPS IP. Caddy
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
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
```

## Stack

- `postgres` — PostgreSQL 16 with a named volume for data.
- `web`, `hub`, `showcase`, `admin` — Next.js standalone builds, one container
  each, built from the app Dockerfiles with the repo root as build context.
- `caddy` — reverse proxy on ports 80/443, config in
  [infra/caddy/Caddyfile](../infra/caddy/Caddyfile), automatic HTTPS.

## Database migrations

Once `packages/db` has a real Prisma setup (Phase 4), the deploy script will
also run:

```bash
docker compose -f docker-compose.prod.yml exec -T hub \
  pnpm --filter @asafarim/db prisma migrate deploy
```

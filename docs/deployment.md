# Deployment

## Architecture

Production application images are built in GitHub Actions, published to the
GitHub Container Registry (GHCR), and tagged with the full Git commit SHA.
The VPS never builds the monorepo during a rollout.

```text
push to main
  -> GitHub Actions builds 20 unique images in parallel
  -> images are pushed to ghcr.io/alisafari-it/asafarim-platform
  -> the VPS pulls that commit's images
  -> migrations run
  -> Docker Compose replaces services with --no-build
```

`testora-migrate` and `testora-seed` intentionally share the same
`testora-migrator-<sha>` image. Database, Redis, Caddy, ClamAV, and MinIO
continue to use their upstream images.

## Normal deployment

A push to `main` triggers [the deployment workflow](../.github/workflows/deploy.yml).
The workflow:

1. Builds and publishes every application image.
2. Connects to the VPS only after every image succeeds.
3. Passes a short-lived GitHub token for the pull; it is stored in a temporary
   Docker config and removed when the deployment exits.
4. Runs [vps-deploy.sh](../infra/scripts/vps-deploy.sh) against the exact commit
   that produced the images.

The workflow uses the built-in `GITHUB_TOKEN`; no additional GHCR secret is
required. Its repository permissions include `packages: write`.

## One-time VPS setup

1. Install Docker Engine, the Docker Compose plugin, Git, `age`, and `flock`.
2. Clone the repository:

   ```bash
   git clone https://github.com/AliSafari-IT/asafarim-platform.git /var/repos/asafarim-com
   ```

3. Create `.env.production` locally from
   [.env.production.example](../.env.production.example), set the production
   values, and run `pnpm env:encrypt:production`. Commit only
   `.env.production.age`.
4. Provision `.age/key.txt` at `/var/repos/asafarim-com/.age/key.txt` through a
   password manager or secrets vault and set mode `0600`.
5. Configure the existing GitHub Actions secrets `VPS_HOST`, `VPS_USER`, and
   `VPS_SSH_KEY`.
6. Point the production DNS records at the VPS. Caddy obtains certificates
   after DNS resolves.

## Manual deployment

GitHub Actions authenticates each pull automatically. For a manual deployment,
log the VPS into GHCR once with a classic PAT that has `read:packages`:

```bash
printf '%s' "$GHCR_READ_TOKEN" | docker login ghcr.io \
  --username YOUR_GITHUB_USERNAME --password-stdin
```

Then deploy the latest successfully published `main` commit from a local
machine:

```bash
pnpm deploy:prod
```

Or from the VPS:

```bash
cd /var/repos/asafarim-com
git fetch --prune origin main
git reset --hard origin/main
IMAGE_TAG="$(git rev-parse HEAD)" bash infra/scripts/vps-deploy.sh
```

If images for that SHA were not published, the pull fails before migrations or
running containers are touched.

## Rollback

Successful deployments record `.deploy/current-release` and
`.deploy/previous-release`. To roll application containers back to the previous
published revision:

```bash
cd /var/repos/asafarim-com
IMAGE_TAG="$(cat .deploy/previous-release)" bash infra/scripts/vps-deploy.sh
```

This does not reverse database migrations. Use forward-compatible migrations
and apply a corrective migration when schema behavior must be reverted.

## Disk retention

- A pull requires at least 20 GB free by default. Override only when measured
  image sizes justify it with `DEPLOY_MIN_FREE_GB`.
- Active images are protected by Docker.
- Only the current and previous platform image sets are retained.
- [cleanup-docker.sh](../infra/scripts/cleanup-docker.sh) never removes volumes.
- Do not add `docker system prune --volumes` to unattended jobs; a detached
  database volume may be the only recovery copy.

## Database migrations

The deployment pulls all images first, starts PostgreSQL, and runs
`platform-migrate` before replacing application containers. App-specific
migration jobs remain Compose dependencies. `docker compose up` calls pass
`--no-build`; `docker compose run` has no such flag, so `platform-migrate`'s
image presence is checked explicitly beforehand instead. Either way, a
missing artifact is an explicit failure rather than an accidental VPS
rebuild.

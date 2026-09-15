#!/usr/bin/env bash
#
# Server-side deploy for the ASafarIM platform (runs ON the VPS).
# Invoked manually or by the GitHub Actions "Deploy to VPS" workflow over SSH.
#
# Prerequisites already provisioned on the VPS (one-time):
#   - Docker Engine + Compose plugin
#   - age CLI            (apt install age)
#   - repo cloned at     /var/repos/asafarim-com
#   - age private key at /var/repos/asafarim-com/.age/key.txt  (chmod 600)
#   - GHCR authentication for manual runs (Actions supplies a temporary token)
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
BRANCH="${BRANCH:-main}"
cd "$REPO_DIR"

# GitHub Actions cancels an older workflow when a newer main revision arrives.
# Cancellation normally terminates the SSH-side process too, but the lock is the
# hard safety boundary: if the old remote shell survives briefly, a replacement
# deploy waits instead of running git, builds, migrations, or Compose operations
# against the same checkout at the same time. The descriptor releases
# automatically whenever this process exits, including on signals or failures.
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${REPO_DIR}/.vps-deploy.lock}"
DEPLOY_LOCK_WAIT_SECONDS="${DEPLOY_LOCK_WAIT_SECONDS:-900}"
exec 9>"${DEPLOY_LOCK_FILE}"
if ! flock -w "${DEPLOY_LOCK_WAIT_SECONDS}" 9; then
  echo "FATAL: another VPS deployment still holds ${DEPLOY_LOCK_FILE} after ${DEPLOY_LOCK_WAIT_SECONDS}s." >&2
  exit 75
fi

echo "[deploy $(date -Is)] Fetching latest ${BRANCH}..."
git fetch --prune origin "$BRANCH"

# GitHub Actions passes the commit whose images it published. Reset to that
# exact revision so Compose configuration, migrations, and images can never
# come from different commits if main advances during a deployment.
if [[ -n "${IMAGE_TAG:-}" ]]; then
  if ! git cat-file -e "${IMAGE_TAG}^{commit}" 2>/dev/null; then
    echo "FATAL: image commit ${IMAGE_TAG} is not present in the repository." >&2
    exit 1
  fi
  git reset --hard "${IMAGE_TAG}"
else
  git reset --hard "origin/${BRANCH}"
  IMAGE_TAG="$(git rev-parse HEAD)"
fi
export IMAGE_TAG
export IMAGE_REPOSITORY="${IMAGE_REPOSITORY:-ghcr.io/alisafari-it/asafarim-platform}"

echo "[deploy $(date -Is)] Decrypting production environment..."
if [[ ! -f .age/key.txt ]]; then
  echo "FATAL: .age/key.txt missing on server. Provision it once (chmod 600)." >&2
  exit 1
fi
age -d -i .age/key.txt .env.production.age > .env.production
chmod 600 .env.production

echo "[deploy $(date -Is)] Validating required environment variables..."
# TIMELINEAI_GUEST_IP_HASH_KEY is listed here because a blank value does not
# fail the build or the container start — it fails at request time, on every
# page that resolves a guest identity, as a 500. It shipped absent and that is
# how tlai.asafarim.com/t/<publicId> served errors while the container looked
# perfectly healthy. Better to refuse the deploy than to serve 500s.
REQUIRED_VARS=(POSTGRES_PASSWORD TESTORA_DB_PASSWORD APPBUILDER_DB_PASSWORD TASKSAI_DB_PASSWORD TIMELINEAI_GUEST_IP_HASH_KEY)
MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  # Matches KEY=value with a non-empty value; tolerates quoted values.
  if ! grep -qE "^${var}=[\"']?[^\"'[:space:]]" .env.production; then
    MISSING_VARS+=("$var")
  fi
done
if (( ${#MISSING_VARS[@]} > 0 )); then
  echo "FATAL: .env.production is missing values for: ${MISSING_VARS[*]}" >&2
  echo "Docker Compose would silently interpolate these as blank strings, breaking DB auth." >&2
  echo "Restore them (see .env.production.example) and re-encrypt with 'pnpm env:encrypt:production'." >&2
  exit 1
fi

# Use the workflow's short-lived GITHUB_TOKEN without persisting it in the
# deploy user's normal Docker configuration. Manual deploys can instead rely
# on an existing `docker login ghcr.io` session on the VPS.
DEPLOY_DOCKER_CONFIG=""

# Runs on every exit, success or failure — a deploy that fails partway
# through (bad migration, invalid Caddyfile) has already pulled up to 20
# fresh images before it aborts. Without this, a repeatedly-failing deploy
# re-pulls and accumulates disk usage on every retry with nothing reclaiming
# it in between, which is the same chronic disk-exhaustion failure mode this
# script was rewritten to avoid — just moved from the build step to the pull
# step. `docker image prune -f` (no `-a`) only removes dangling/untagged
# layers, never the tagged current/previous release images a retry needs.
cleanup_on_exit() {
  local exit_code=$?
  if [[ -n "${DEPLOY_DOCKER_CONFIG}" && -d "${DEPLOY_DOCKER_CONFIG}" ]]; then
    rm -f -- "${DEPLOY_DOCKER_CONFIG}/config.json"
    rmdir -- "${DEPLOY_DOCKER_CONFIG}" 2>/dev/null || true
  fi
  if (( exit_code != 0 )); then
    echo "[deploy $(date -Is)] Deploy exited with an error — pruning dangling images and build cache..."
    docker image prune -f >/dev/null 2>&1 || true
    docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
  fi
  exit "${exit_code}"
}
trap cleanup_on_exit EXIT

if [[ -n "${GHCR_TOKEN:-}" ]]; then
  if [[ -z "${GHCR_USERNAME:-}" ]]; then
    echo "FATAL: GHCR_TOKEN was provided without GHCR_USERNAME." >&2
    exit 1
  fi
  DEPLOY_DOCKER_CONFIG="$(mktemp -d)"
  chmod 700 "${DEPLOY_DOCKER_CONFIG}"
  export DOCKER_CONFIG="${DEPLOY_DOCKER_CONFIG}"
  printf '%s' "${GHCR_TOKEN}" | docker login ghcr.io \
    --username "${GHCR_USERNAME}" --password-stdin >/dev/null
  unset GHCR_TOKEN
fi

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-asafarim-com}"
export COMPOSE_PARALLEL_LIMIT="${COMPOSE_PARALLEL_LIMIT:-4}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

RELEASE_SERVICES=(platform-migrate web hub showcase admin vionto vionto-worker edumatch testora-migrate testora-seed testora appbuilder-migrate appbuilder-worker appbuilder timelineai labs jobmatch-migrate jobmatch tasksai-migrate tasksai-worker tasksai)

available_gb() {
  local docker_root
  docker_root="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
  df -BG --output=avail "$docker_root" 2>/dev/null | tail -n1 | tr -dc '0-9' || true
}

# shellcheck source=lib/prune-release-images.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/prune-release-images.sh"

# Remove only legacy Compose-built application tags from the old deployment
# model. Docker refuses to delete an image still used by a container, so the
# currently running release remains protected. This migration cleanup avoids
# carrying the ~11GB of failed local builds observed in September 2026.
mapfile -t LEGACY_IMAGES < <(
  docker image ls --format '{{.Repository}}:{{.Tag}}' |
    awk '$0 ~ /^asafarim-com-/ { print }'
)
if (( ${#LEGACY_IMAGES[@]} > 0 )); then
  echo "[deploy $(date -Is)] Removing unused legacy VPS-built image tags..."
  docker image rm "${LEGACY_IMAGES[@]}" >/dev/null 2>&1 || true
fi

MIN_PULL_FREE_GB="${DEPLOY_MIN_FREE_GB:-20}"
AVAIL_GB="$(available_gb)"; AVAIL_GB="${AVAIL_GB:-0}"
if (( AVAIL_GB < MIN_PULL_FREE_GB )); then
  echo "[deploy $(date -Is)] Only ${AVAIL_GB}GB free; pruning platform images except the current and previous releases..."
  prune_superseded_platform_images
  AVAIL_GB="$(available_gb)"; AVAIL_GB="${AVAIL_GB:-0}"
fi
if (( AVAIL_GB < MIN_PULL_FREE_GB )); then
  echo "FATAL: only ${AVAIL_GB}GB free; ${MIN_PULL_FREE_GB}GB is required for a safe image pull." >&2
  echo "No volumes were removed. Inspect Docker images, backups, and /var/lib/containerd before retrying." >&2
  exit 1
fi

echo "[deploy $(date -Is)] Pulling ${#RELEASE_SERVICES[@]} service images for ${IMAGE_TAG} (${AVAIL_GB}GB free)..."
"${COMPOSE[@]}" pull "${RELEASE_SERVICES[@]}"

mapfile -t STALE_REPLACEMENT_CONTAINERS < <(
  docker ps -a \
    --filter "label=com.docker.compose.project=${COMPOSE_PROJECT_NAME}" \
    --format '{{.ID}} {{.Names}}' |
    awk -v project="${COMPOSE_PROJECT_NAME}" '$2 ~ "^[[:xdigit:]]{12}_" project "-" { print $1 }'
)
if (( ${#STALE_REPLACEMENT_CONTAINERS[@]} > 0 )); then
  echo "[deploy $(date -Is)] Removing stale replacement containers..."
  docker rm -f "${STALE_REPLACEMENT_CONTAINERS[@]}"
fi

# Run the shared-schema migration BEFORE recreating any app container, and let
# a failure abort the deploy while the currently-running (working) stack is
# still untouched. `up -d` would enforce this ordering on its own via
# depends_on, but doing it as an explicit step keeps the migration output as
# its own section in the deploy log instead of interleaved with 13 services.
echo "[deploy $(date -Is)] Applying platform database migrations..."
"${COMPOSE[@]}" up -d --wait --no-build postgres
# `docker compose run` has no `--no-build` flag (only `--build`, to force
# one) — unlike `up`, it silently builds locally when the image is missing
# rather than failing. Check the image is actually present first so a gap
# earlier in this script (pull skipped or silently incomplete for just this
# one image) fails loudly here instead of falling back to the slow,
# disk-hungry local build this whole redesign exists to avoid.
PLATFORM_MIGRATE_IMAGE="${IMAGE_REPOSITORY}:platform-migrate-${IMAGE_TAG}"
if ! docker image inspect "${PLATFORM_MIGRATE_IMAGE}" >/dev/null 2>&1; then
  echo "FATAL: ${PLATFORM_MIGRATE_IMAGE} is not present locally — refusing to let" >&2
  echo "'docker compose run' fall back to building it on the VPS. Re-run the pull step." >&2
  exit 1
fi
# `run --rm` rather than `up --exit-code-from`: the latter implies
# --abort-on-container-exit, which would tear down the attached `postgres`
# dependency the moment the migration finishes — stopping the database in the
# middle of a deploy. `run` propagates the job's exit code without touching
# anything else, and still honours the service_healthy condition on postgres.
if ! "${COMPOSE[@]}" run --rm platform-migrate; then
  echo "FATAL: platform database migration failed — aborting before app containers are replaced." >&2
  echo "The previous release is still running. Inspect with:" >&2
  echo "  docker compose -f docker-compose.prod.yml --env-file .env.production logs platform-migrate" >&2
  exit 1
fi

echo "[deploy $(date -Is)] Starting stack..."
"${COMPOSE[@]}" up -d --remove-orphans --no-build

# The Caddyfile is bind-mounted, so applying configuration does not require a
# container replacement. Force-recreating Caddy briefly closes public ports 80
# and 443; visitors then see the browser's ERR_CONNECTION_TIMED_OUT page and
# Caddy cannot serve the friendly 502/503/504 deployment fallback. Validate the
# new file first, then reload it inside the existing process. `caddy reload`
# swaps configuration gracefully without interrupting active listeners.
echo "[deploy $(date -Is)] Validating and gracefully reloading Caddy..."
if ! "${COMPOSE[@]}" exec -T caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
  echo "FATAL: Caddy configuration is invalid — keeping the current proxy configuration." >&2
  exit 1
fi
"${COMPOSE[@]}" exec -T caddy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

# Record immutable revisions for operators and retain recent images for a
# quick rollback. Active container images are always protected by Docker.
mkdir -p .deploy
if [[ -f .deploy/current-release ]]; then
  cp .deploy/current-release .deploy/previous-release
fi
printf '%s\n' "${IMAGE_TAG}" > .deploy/current-release

echo "[deploy $(date -Is)] Retaining only the current and previous platform image sets..."
prune_superseded_platform_images

echo "[deploy $(date -Is)] Sending deployment notification..."
DISCORD_WEBHOOK=""
if [[ -f ".env.production" ]]; then
  DISCORD_WEBHOOK="$(grep -E '^WEBHOOK_SECRET_DISCORD=' .env.production | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi
if [[ -n "${DISCORD_WEBHOOK}" && "${DISCORD_WEBHOOK}" == https://discord.com/api/webhooks/* ]]; then
  HOSTNAME="${HOSTNAME:-$(hostname)}"
  curl -sS -X POST -H "Content-Type: application/json" \
    -d '{"content":"✅ ASafarIM Platform deployed successfully on '"${HOSTNAME}"'."}' \
    "${DISCORD_WEBHOOK}" || echo "Webhook notification failed (non-fatal)." >&2
else
  echo "WEBHOOK_SECRET_DISCORD not configured — skipping notification."
fi

echo "[deploy $(date -Is)] Done. Current state:"
"${COMPOSE[@]}" ps

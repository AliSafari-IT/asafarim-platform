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
#
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
BRANCH="${BRANCH:-main}"
cd "$REPO_DIR"

echo "[deploy $(date -Is)] Fetching latest ${BRANCH}..."
git fetch --prune origin "$BRANCH"
git reset --hard "origin/${BRANCH}"   # tracked files only; ignores .env.production & .age/

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
REQUIRED_VARS=(POSTGRES_PASSWORD TESTORA_DB_PASSWORD APPBUILDER_DB_PASSWORD TIMELINEAI_GUEST_IP_HASH_KEY)
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

# Always reclaim dangling images/build cache on exit (success or failure) so
# repeated failed deploys don't silently fill the disk before the next run.
cleanup() {
  echo "[deploy $(date -Is)] Pruning dangling images and build cache..."
  docker image prune -f >/dev/null 2>&1 || true
  docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
}
trap cleanup EXIT

export DOCKER_BUILDKIT=1
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-asafarim-com}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

BUILD_SERVICES=(platform-migrate web hub showcase admin vionto vionto-worker edumatch testora-migrate testora appbuilder-migrate appbuilder-worker appbuilder timelineai labs)

# Building ${#BUILD_SERVICES[@]} images sequentially is the single biggest
# disk consumer in this script (each build leaves layers + build cache
# behind) — check for headroom BEFORE starting, and proactively reclaim space
# rather than discovering "no space left on device" partway through a build.
ensure_disk_space() {
  local docker_root
  docker_root="$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"
  local min_free_gb="${DEPLOY_MIN_FREE_GB:-10}"

  avail_gb() {
    # `tr -dc` can leave this empty (e.g. `df` failing) — under `set -euo
    # pipefail` an empty operand would abort the whole script on the next
    # arithmetic comparison, so fail safe to 0 (triggers pruning) rather than
    # crashing the deploy on a disk-space *check* itself.
    df -BG --output=avail "$docker_root" 2>/dev/null | tail -n1 | tr -dc '0-9' || true
  }

  local avail
  avail="$(avail_gb)"; avail="${avail:-0}"
  echo "[deploy $(date -Is)] ${avail}GB free on ${docker_root} (need >= ${min_free_gb}GB to build ${#BUILD_SERVICES[@]} images sequentially)."
  if (( avail >= min_free_gb )); then
    return 0
  fi

  echo "[deploy $(date -Is)] Low disk space — reclaiming space before building (round 1: dangling images + old build cache)..."
  docker image prune -f >/dev/null 2>&1 || true
  docker container prune -f >/dev/null 2>&1 || true
  docker builder prune -f --filter until=24h >/dev/null 2>&1 || true
  avail="$(avail_gb)"; avail="${avail:-0}"
  echo "[deploy $(date -Is)] ${avail}GB free after round 1."
  if (( avail >= min_free_gb )); then
    return 0
  fi

  echo "[deploy $(date -Is)] Still low — reclaiming space (round 2: ALL unused images + full build cache, not just dangling/24h)..."
  docker image prune -af >/dev/null 2>&1 || true
  docker builder prune -af >/dev/null 2>&1 || true
  avail="$(avail_gb)"; avail="${avail:-0}"
  echo "[deploy $(date -Is)] ${avail}GB free after round 2."
  if (( avail >= min_free_gb )); then
    return 0
  fi

  # Deliberately does NOT touch `docker volume prune` here — an unused-looking
  # volume can still be a previous release's Postgres data kept for recovery;
  # freeing space by deleting data is a human decision, not an automated one.
  echo "FATAL: only ${avail}GB free on ${docker_root} after pruning images and build cache (need ${min_free_gb}GB)." >&2
  echo "Refusing to start a build that would likely fail mid-way from disk exhaustion." >&2
  echo "Free space manually (e.g. 'docker volume ls' for stale/orphaned volumes, or check log/backup growth on the VPS) and re-run." >&2
  return 1
}
ensure_disk_space

echo "[deploy $(date -Is)] Building images sequentially (memory-safe on 8GB)..."
for svc in "${BUILD_SERVICES[@]}"; do
  echo "[deploy $(date -Is)] ===== build ${svc} ====="
  "${COMPOSE[@]}" build "$svc"
done

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
"${COMPOSE[@]}" up -d --wait postgres
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
"${COMPOSE[@]}" up -d --remove-orphans
"${COMPOSE[@]}" up -d --force-recreate --no-deps caddy

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

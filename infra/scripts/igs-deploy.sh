#!/usr/bin/env bash
#
# Deploy igs-pharma.be staging (#822): the `igs` compose project
# (infra/igs/docker-compose.yml). Runs ON the VPS, from the platform checkout.
#
#   infra/scripts/igs-deploy.sh <sha>     full 40-character igs-pharma commit
#
# 1. Decrypt .env.igs.age → .env.igs (refused while it still has placeholders).
# 2. Pull ghcr.io/alisafari-it/igs-pharma-{web,platform,worker}:<sha>.
# 3. Start igs-postgres and wait until it accepts connections.
# 4. Run the one-shot migrator (migrations + pg-boss schema); a failure stops
#    the deploy before any app is replaced.
# 5. Start igs-web, igs-platform and igs-worker, wait for their health checks,
#    then check readiness (/api/health, database included) from inside each.
# 6. Publish sites/igs-pharma.caddy through edge-deploy-site.sh, and say which
#    Caddy serves the site (before the edge cutover: the asafarim-com one).
#
# Idempotent: rerunning with the same <sha> changes nothing. It only ever runs
# `docker compose -p igs`; the asafarim-com stack is read (inspect), never
# changed.
set -euo pipefail

SHA="${1:-}"
if [[ ! "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: igs-deploy.sh <sha>  (the full 40-character igs-pharma commit; got '${SHA}')" >&2
  exit 2
fi

REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"
WAIT_SECONDS="${IGS_WAIT_SECONDS:-180}"
cd "$REPO_DIR"

ENV_FILE=".env.igs"
export IGS_IMAGE_TAG="$SHA"
COMPOSE=(docker compose -p igs -f infra/igs/docker-compose.yml --env-file "$ENV_FILE")
SITE_FILE="infra/edge/caddy/sites/igs-pharma.caddy"

log() { echo "[igs $(date -Is)] $*"; }
warn() { echo "[igs $(date -Is)] WARNING: $*" >&2; }
fail() {
  echo "[igs $(date -Is)] FATAL: $*" >&2
  exit 1
}

# One igs deploy at a time.
exec 9>"${REPO_DIR}/.igs-deploy.lock"
flock -w 900 9 || { echo "[igs] another igs deploy still holds .igs-deploy.lock" >&2; exit 75; }

# 1. Env: decrypt to a private file, swap it in whole.
log "Decrypting .env.igs.age..."
[[ -f .env.igs.age ]] || fail ".env.igs.age is missing from ${REPO_DIR}"
(
  umask 077
  age -d -i .age/key.txt .env.igs.age >"${ENV_FILE}.next"
)
mv -f "${ENV_FILE}.next" "$ENV_FILE"
if grep -q 'REPLACE_ME' "$ENV_FILE"; then
  fail ".env.igs still has REPLACE_ME placeholders: fill in the real values (pnpm env:decrypt:igs, edit, pnpm env:encrypt:igs), commit .env.igs.age, and rerun."
fi
"${COMPOSE[@]}" config --quiet || fail "infra/igs/docker-compose.yml doesn't resolve with .env.igs"

# The public services join the shared edge's network; vps-deploy.sh normally creates it.
if ! docker network inspect edge_net >/dev/null 2>&1; then
  docker network create edge_net >/dev/null
  log "Created network edge_net"
fi

# 2. Images.
log "Pulling igs-pharma images ${SHA:0:12}..."
"${COMPOSE[@]}" pull --quiet

# 3. Database.
log "Starting igs-postgres..."
"${COMPOSE[@]}" up -d --wait --wait-timeout "$WAIT_SECONDS" igs-postgres

# 4. Migrations, before any app changes.
log "Migrating (node dist/migrate.js)..."
"${COMPOSE[@]}" run --rm --no-deps igs-migrate || fail "the migrator failed; the running apps were left as they were."

# 5. Apps.
log "Starting igs-web, igs-platform, igs-worker..."
"${COMPOSE[@]}" up -d --no-deps --wait --wait-timeout "$WAIT_SECONDS" igs-web igs-platform igs-worker \
  || fail "the apps did not become healthy within ${WAIT_SECONDS}s (docker compose -p igs logs)."

ready() {
  local service="$1" port="$2" _
  for _ in $(seq 1 10); do
    if "${COMPOSE[@]}" exec -T "$service" wget -qO- "http://127.0.0.1:${port}/api/health" >/dev/null 2>&1; then
      log "${service}: /api/health ok"
      return 0
    fi
    sleep "${IGS_HEALTH_DELAY:-3}"
  done
  return 1
}
ready igs-web 3000 || fail "igs-web is up but /api/health (database) isn't ok."
ready igs-platform 3001 || fail "igs-platform is up but /api/health (database) isn't ok."

# 6. The site file, on the shared edge.
log "Publishing sites/igs-pharma.caddy to the shared edge..."
EDGE_DIR="$EDGE_DIR" infra/edge/scripts/edge-deploy-site.sh igs-pharma "$SITE_FILE" \
  || fail "the edge refused sites/igs-pharma.caddy (the apps are running; the site file is unchanged)."

# Which Caddy serves igs-pharma.be (read only).
compose_container() {
  docker ps -q --filter "label=com.docker.compose.project=$1" --filter "label=com.docker.compose.service=caddy" | head -n1
}
allow_ips="$(sed -n 's/^IGS_PLATFORM_ALLOW_IPS=//p' "$ENV_FILE" | tail -n1)"
check_allow_list() {
  local id="$1" served
  served="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$id" | sed -n 's/^IGS_PLATFORM_ALLOW_IPS=//p')"
  if [[ -z "$allow_ips" ]]; then
    warn "IGS_PLATFORM_ALLOW_IPS isn't set in .env.igs."
  elif [[ "$served" != "$allow_ips" ]]; then
    warn "the serving Caddy's IGS_PLATFORM_ALLOW_IPS ('${served:-unset}') differs from .env.igs; platform.igs-pharma.be uses the Caddy's."
  fi
}

edge_id="$(compose_container edge)"
if [[ -n "$edge_id" ]]; then
  log "Served by the shared edge (sites/igs-pharma.caddy, reloaded above)."
  check_allow_list "$edge_id"
else
  live_id="$(compose_container asafarim-com)"
  if [[ -z "$live_id" ]]; then
    warn "no edge and no asafarim-com Caddy is running: nothing serves igs-pharma.be."
  else
    log "Before the edge cutover: served by the asafarim-com Caddy (infra/caddy/Caddyfile)."
    if ! docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' "$live_id" | grep -qx edge_net; then
      warn "the asafarim-com Caddy isn't on edge_net, so it can't reach igs-web: run infra/scripts/caddy-recreate.sh --yes once (quiet moment)."
    fi
    if ! docker exec "$live_id" grep -q '^igs-pharma\.be {' /etc/caddy/Caddyfile; then
      warn "the asafarim-com Caddy's Caddyfile has no igs-pharma.be block yet: deploy the asafarim-com stack (vps-deploy.sh) with this checkout."
    fi
    check_allow_list "$live_id"
  fi
fi

log "Done: igs ${SHA:0:12} is running."

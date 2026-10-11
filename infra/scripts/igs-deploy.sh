#!/usr/bin/env bash
#
# Deploy igs-pharma.be staging (asafarim-platform#822, roadmap IGS-D2/D3/D5/D8).
# Runs ON the VPS, by Ali, from the asafarim-com checkout:
#
#   infra/scripts/igs-deploy.sh <full-40-char-igs-pharma-commit-sha>
#
# 1. Decrypt infra/igs/.env.igs.age (the igs env, separate from every other app's)
#    and check it: required keys set, no placeholders, a valid allowlist.
# 2. Pull the three igs-pharma images for that SHA.
# 3. Start igs-postgres, run igs-migrate (one-shot, idempotent). A failed
#    migration stops here: the running release keeps serving.
# 4. Start igs-web, igs-platform and igs-worker on the same SHA and wait until
#    they are healthy and /api/health (with the database) answers 200.
# 5. Render the site file with the allowlist and publish it on the shared edge
#    (edge-deploy-site.sh). Before the edge cutover, also install it for the
#    Caddy that owns 443 today (asafarim-com's), validated and reloaded.
#
# Idempotent: running it again with the same SHA changes nothing but the
# reloads. It only ever uses the compose project `igs`: it never starts, stops
# or recreates anything of the asafarim-com stack. Before the cutover, step 5
# reloads the live Caddy gracefully, as every asafarim-com deploy does.
set -euo pipefail

SHA="${1:-}"
REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib"
# shellcheck source=lib/igs.sh
source "${LIB}/igs.sh"
# shellcheck source=lib/edge.sh
source "${LIB}/edge.sh"

igs_require_sha "$SHA"
cd "$REPO_DIR"

STACK_DIR="infra/igs"
ENV_FILE="${STACK_DIR}/.env.igs"
log() { echo "[igs-deploy $(date -Is)] $*"; }

# 1. The env.
[[ -f .age/key.txt ]] || { echo "FATAL: .age/key.txt missing on the server." >&2; exit 1; }
[[ -f "${ENV_FILE}.age" ]] || { echo "FATAL: ${ENV_FILE}.age missing." >&2; exit 1; }
(umask 077 && age -d -i .age/key.txt "${ENV_FILE}.age" >"$ENV_FILE")

missing=()
for key in IGS_POSTGRES_PASSWORD IGS_MIGRATOR_DATABASE_URL IGS_PLATFORM_ALLOW_IPS \
  DATABASE_URL AUTH_SECRET AUDIT_HMAC_KEY ENCRYPTION_KEY; do
  value="$(igs_env_value "$ENV_FILE" "$key" || true)"
  if [[ -z "$value" || "$value" == *CHANGE_ME* ]]; then missing+=("$key"); fi
done
if ((${#missing[@]})); then
  echo "FATAL: set these in ${ENV_FILE}.age (decrypt, edit, re-encrypt): ${missing[*]}" >&2
  exit 1
fi
ALLOWLIST="$(igs_allowlist "$(igs_env_value "$ENV_FILE" IGS_PLATFORM_ALLOW_IPS)")"
igs_app_env "$ENV_FILE" "${STACK_DIR}/.env.igs.apps"

export IGS_IMAGE_TAG="$SHA"
COMPOSE=(docker compose -p igs -f "${STACK_DIR}/docker-compose.yml" --env-file "$ENV_FILE")
ensure_edge_net

# 2. Images.
log "Pulling igs-pharma-{web,platform,worker}:${SHA:0:12}..."
"${COMPOSE[@]}" pull --quiet igs-postgres-tls igs-postgres igs-migrate igs-web igs-platform igs-worker

# 3. Database, then migrations, before any app changes.
log "Starting igs-postgres..."
"${COMPOSE[@]}" up -d --wait igs-postgres
log "Running igs-migrate..."
if ! "${COMPOSE[@]}" run --rm --no-deps igs-migrate; then
  echo "FATAL: igs-migrate failed; the apps were not changed (the running release keeps serving)." >&2
  exit 1
fi

# 4. Apps, on the same SHA.
log "Starting igs-web, igs-platform, igs-worker..."
"${COMPOSE[@]}" up -d --wait --no-deps igs-web igs-platform igs-worker

ready() { # <service> <port>
  "${COMPOSE[@]}" exec -T "$1" node -e \
    "fetch('http://127.0.0.1:$2/api/health').then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))"
}
for svc in "igs-web 3000" "igs-platform 3001"; do
  read -r name port <<<"$svc"
  for _ in $(seq 1 24); do
    if ready "$name" "$port"; then log "${name}: /api/health 200"; continue 2; fi
    sleep 5
  done
  echo "FATAL: ${name} /api/health did not answer 200 within 2 minutes (database reachable? migrated?)." >&2
  exit 1
done

# 5. The site file: render (the allowlist stays on the server), publish.
rendered="$(mktemp)"
trap 'rm -f "$rendered"' EXIT
igs_render_site "${STACK_DIR}/igs-pharma.caddy.template" "$ALLOWLIST" "$rendered"
[[ -f "${EDGE_DIR}/caddy/Caddyfile" ]] || {
  echo "FATAL: the shared edge is not installed at ${EDGE_DIR} (an asafarim-com deploy installs it)." >&2
  exit 1
}
log "Publishing sites/igs-pharma.caddy on the shared edge..."
EDGE_DIR="$EDGE_DIR" bash infra/edge/scripts/edge-deploy-site.sh igs-pharma "$rendered"

if [[ -z "$(docker compose -p edge ps -q caddy 2>/dev/null || true)" ]]; then
  log "Pre-cutover: the asafarim-com Caddy owns 443; installing the site file there too..."
  igs_publish_live "$rendered"
fi

log "Done: igs-pharma ${SHA:0:12} is up. Check: curl -sI https://igs-pharma.be/nl ; curl -s https://igs-pharma.be/api/health"

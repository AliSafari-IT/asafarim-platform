#!/usr/bin/env bash
#
# Ops-only: recreate the Caddy container so it picks up a changed Compose
# definition (mounts, image, ports). Runs ON the VPS, from the repo checkout.
#
# Recreating Caddy closes public ports 80 and 443 for a few seconds, so this
# is never done by CI: vps-deploy.sh starts Caddy with --no-recreate and only
# reloads its configuration. Run it at a quiet moment. First needed for #733
# (single-file Caddyfile mount → directory mount).
#
#   infra/scripts/caddy-recreate.sh --yes
#
set -euo pipefail

if [[ "${1:-}" != "--yes" ]]; then
  echo "This recreates Caddy and briefly drops ports 80/443. Re-run with --yes to proceed." >&2
  exit 2
fi

REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
cd "$REPO_DIR"

export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-asafarim-com}"
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

# Share the deploy's lock so a concurrent deploy can't reload a half-made container.
DEPLOY_LOCK_FILE="${DEPLOY_LOCK_FILE:-${REPO_DIR}/.vps-deploy.lock}"
exec 9>"${DEPLOY_LOCK_FILE}"
if ! flock -w 900 9; then
  echo "FATAL: a deployment still holds ${DEPLOY_LOCK_FILE}." >&2
  exit 75
fi

# shellcheck source=lib/verify-caddy.sh
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib/verify-caddy.sh"

# Validate the checkout's Caddyfile in a throwaway container before touching
# the live one, so an invalid file can't leave the site without a proxy.
echo "[caddy $(date -Is)] Validating infra/caddy/Caddyfile..."
CADDY_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$("${COMPOSE[@]}" ps -q caddy)" 2>/dev/null || echo caddy:latest)"
docker run --rm -v "${REPO_DIR}/infra/caddy:/etc/caddy:ro" "${CADDY_IMAGE}" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

echo "[caddy $(date -Is)] Recreating Caddy (ports 80/443 drop briefly)..."
"${COMPOSE[@]}" up -d --no-deps --no-build --force-recreate caddy

echo "[caddy $(date -Is)] Verifying..."
if ! verify_caddy_config; then
  echo "FATAL: Caddy verification failed after the recreate." >&2
  exit 1
fi
echo "[caddy $(date -Is)] Done."

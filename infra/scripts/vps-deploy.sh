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

export DOCKER_BUILDKIT=1
COMPOSE=(docker compose -f docker-compose.prod.yml --env-file .env.production)

echo "[deploy $(date -Is)] Building images sequentially (memory-safe on 8GB)..."
for svc in web hub showcase admin vionto vionto-worker; do
  echo "[deploy $(date -Is)] ===== build ${svc} ====="
  "${COMPOSE[@]}" build "$svc"
done

echo "[deploy $(date -Is)] Starting stack..."
"${COMPOSE[@]}" up -d --remove-orphans

echo "[deploy $(date -Is)] Pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo "[deploy $(date -Is)] Done. Current state:"
"${COMPOSE[@]}" ps

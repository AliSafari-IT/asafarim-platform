#!/usr/bin/env bash

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Resolve SERVER_HOST: prefer an already-exported variable, then .env.production.
if [[ -z "${SERVER_HOST:-}" && -f "${REPO_ROOT}/.env.production" ]]; then
  SERVER_HOST="$(grep -E '^SERVER_HOST=' "${REPO_ROOT}/.env.production" | tail -n1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
fi

if [[ -z "${SERVER_HOST:-}" ]]; then
  echo "SERVER_HOST is not set. Export it or add it to .env.production." >&2
  exit 1
fi

SERVER_USER="${SERVER_USER:-root}"
PROJECT_DIR="${PROJECT_DIR:-/srv/asafarim-platform}"
BRANCH="${BRANCH:-main}"

echo "Deploying ASafarIM Platform to ${SERVER_USER}@${SERVER_HOST}:${PROJECT_DIR} (${BRANCH})..."

ssh "${SERVER_USER}@${SERVER_HOST}" << EOF
  set -euo pipefail

  cd "${PROJECT_DIR}"

  echo "Fetching latest code..."
  git fetch origin
  git checkout ${BRANCH}
  git pull origin ${BRANCH}

  echo "Installing workspace tooling..."
  corepack enable
  pnpm install --frozen-lockfile

  if [[ ! -f .age/key.txt ]]; then
    echo "Missing .age/key.txt. Provision the Envage private key through the secrets manager." >&2
    exit 1
  fi

  if [[ ! -f .env.production.age ]]; then
    echo "Missing .env.production.age. Encrypt and commit the production environment first." >&2
    exit 1
  fi

  echo "Decrypting the production environment..."
  printf 'y\n' | pnpm env:decrypt:production

  echo "Starting Docker containers..."
  docker compose --env-file .env.production -f docker-compose.prod.yml \
    up -d --build --remove-orphans

  echo "Cleaning old Docker images..."
  docker image prune -f

  echo "Deployment finished."
EOF

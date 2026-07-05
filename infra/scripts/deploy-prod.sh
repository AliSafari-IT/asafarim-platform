#!/usr/bin/env bash

set -euo pipefail

SERVER_USER="root"
SERVER_HOST="YOUR_VPS_IP_OR_DOMAIN"
PROJECT_DIR="/srv/asafarim-platform"
BRANCH="main"

echo "Deploying ASafarIM Platform..."

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

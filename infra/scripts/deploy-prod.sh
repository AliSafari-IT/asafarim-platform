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

  echo "Starting Docker containers..."
  docker compose -f docker-compose.prod.yml up -d --build --remove-orphans

  echo "Cleaning old Docker images..."
  docker image prune -f

  echo "Deployment finished."
EOF

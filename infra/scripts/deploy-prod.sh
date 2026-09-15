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
PROJECT_DIR="${PROJECT_DIR:-/var/repos/asafarim-com}"
BRANCH="${BRANCH:-main}"

echo "Deploying ASafarIM Platform to ${SERVER_USER}@${SERVER_HOST}:${PROJECT_DIR} (${BRANCH})..."

ssh "${SERVER_USER}@${SERVER_HOST}" << EOF
  set -euo pipefail

  cd "${PROJECT_DIR}"

  echo "Fetching latest code..."
  git fetch --prune origin "${BRANCH}"
  git reset --hard "origin/${BRANCH}"

  # Images for this commit must already have been published by deploy.yml.
  # Manual deployments use the VPS's existing GHCR login session (created via
  # "docker login ghcr.io" — backticks avoided here on purpose: this text
  # sits inside an unquoted <<EOF heredoc, so bash performs command
  # substitution on backticks even inside a "#" comment).
  export IMAGE_TAG="\$(git rev-parse HEAD)"
  export BRANCH="${BRANCH}"
  bash infra/scripts/vps-deploy.sh
EOF

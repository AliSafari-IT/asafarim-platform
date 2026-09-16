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

  # Images for this commit must already have been published by deploy.yml.
  # Manual deployments use the VPS's existing GHCR login session (created via
  # "docker login ghcr.io" — backticks avoided here on purpose: this text
  # sits inside an unquoted <<EOF heredoc, so bash performs command
  # substitution on backticks even inside a "#" comment).
  #
  # Does not reset the tracked working tree here, and does not open the
  # tracked infra/scripts/vps-deploy.sh directly — see that script and
  # .github/workflows/deploy.yml for why: the reset and the script file it
  # opens both need to happen inside vps-deploy.sh's own flock lock, or an
  # overlapping deploy can rewrite the shared checkout out from under one
  # already in flight, and a script that rewrites itself mid-execution via
  # its own git reset silently finishes running whatever was on disk before
  # it started. Reading the target script straight out of the object
  # database into an untracked, uniquely-named copy sidesteps both.
  export IMAGE_TAG="\$(git rev-parse "origin/${BRANCH}")"
  export BRANCH="${BRANCH}"
  BOOTSTRAP="infra/scripts/.vps-deploy.\${IMAGE_TAG}.sh"
  trap 'rm -f "\$BOOTSTRAP"' EXIT
  git show "\${IMAGE_TAG}:infra/scripts/vps-deploy.sh" > "\$BOOTSTRAP"
  bash "\$BOOTSTRAP"
EOF

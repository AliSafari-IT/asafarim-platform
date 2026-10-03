#!/usr/bin/env bash
# Periodic disk cleanup for the VPS, meant to run independently of deploys
# (via cron) so space doesn't accumulate between releases.
#
# Removes:
#   - stopped containers and dangling images
#   - ASafariM platform images except the current and previous releases
#   - build cache and unused networks older than seven days
#
# Named and anonymous volumes are deliberately never pruned automatically.
# A detached PostgreSQL volume may be the only rollback/recovery copy.
#
# Install as a weekly cron job (see infra/README or deploy docs):
#   crontab -e
#   0 4 * * 0 /var/repos/asafarim-com/infra/scripts/cleanup-docker.sh >> /var/log/docker-cleanup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
cd "${REPO_DIR}"

# shellcheck source=lib/prune-release-images.sh
source "${SCRIPT_DIR}/lib/prune-release-images.sh"

echo "=== $(date -Iseconds) — Docker cleanup starting ==="

echo "Disk usage before:"
docker system df
df -h /

echo "Pruning stopped containers and expired image/build artifacts (never volumes)..."
docker container prune -f
docker image prune -f

prune_superseded_platform_images

docker builder prune -f --filter 'until=168h'
docker network prune -f --filter 'until=168h'

echo "Disk usage after:"
docker system df
df -h /

echo "=== $(date -Iseconds) — Docker cleanup finished ==="

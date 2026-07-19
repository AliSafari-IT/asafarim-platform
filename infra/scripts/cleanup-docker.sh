#!/usr/bin/env bash
# Periodic disk cleanup for the VPS, meant to run independently of deploys
# (via cron) so space doesn't accumulate between releases.
#
# Removes:
#   - stopped containers
#   - unused images not referenced by any container
#   - unused build cache
#   - unused (anonymous/dangling) volumes and networks
#   - journal logs older than 3 days (Docker container logs are managed by
#     the daemon's log-opts, not this script — see note below)
#
# Install as a weekly cron job (see infra/README or deploy docs):
#   crontab -e
#   0 4 * * 0 /srv/asafarim-platform/infra/scripts/cleanup-docker.sh >> /var/log/docker-cleanup.log 2>&1

set -euo pipefail

echo "=== $(date -Iseconds) — Docker cleanup starting ==="

echo "Disk usage before:"
docker system df
df -h /

echo "Pruning stopped containers, unused images, build cache, volumes, networks..."
docker system prune -af --volumes

echo "Disk usage after:"
docker system df
df -h /

echo "=== $(date -Iseconds) — Docker cleanup finished ==="

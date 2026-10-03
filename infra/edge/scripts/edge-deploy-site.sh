#!/usr/bin/env bash
#
# Publish ONE stack's site file on the shared edge (#770). Runs ON the VPS.
#
#   infra/edge/scripts/edge-deploy-site.sh <stack> <site-file>
#   e.g. edge-deploy-site.sh asafarim-com infra/edge/caddy/sites/asafarim-com.caddy
#
# 1. Copies <site-file> beside the live config as sites/<stack>.caddy.next.
# 2. Validates the WHOLE edge config with that file swapped in, in a throwaway
#    container. Invalid → the live config is untouched, only this stack's
#    deploy fails (exit 1).
# 3. Swaps the file in atomically, `caddy reload`s the running edge (graceful),
#    and checks the in-container sha256 of this stack's file matches the host's
#    (the #733 lesson). Before the cutover (no edge container yet) step 3 only
#    installs the file.
set -euo pipefail

STACK="${1:?usage: edge-deploy-site.sh <stack> <site-file>}"
SOURCE="${2:?usage: edge-deploy-site.sh <stack> <site-file>}"
EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"
CADDY_IMAGE="${EDGE_CADDY_IMAGE:-caddy:2.11.4}"
SITES="${EDGE_DIR}/caddy/sites"

if [[ ! "$STACK" =~ ^[a-z0-9-]+$ ]]; then
  echo "edge: invalid stack name '$STACK'" >&2
  exit 2
fi
[[ -f "$SOURCE" ]] || { echo "edge: no site file at $SOURCE" >&2; exit 2; }
[[ -f "${EDGE_DIR}/caddy/Caddyfile" ]] || { echo "edge: ${EDGE_DIR}/caddy/Caddyfile missing (edge not installed)" >&2; exit 2; }
mkdir -p "$SITES"

# Validate a candidate copy of the whole config: everything live, plus ours.
candidate="$(mktemp -d)"
trap 'rm -rf "$candidate"' EXIT
cp -R "${EDGE_DIR}/caddy/." "$candidate/"
cp "$SOURCE" "$candidate/sites/${STACK}.caddy"
if ! docker run --rm -v "$candidate:/etc/caddy:ro" -w /etc/caddy "$CADDY_IMAGE" \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$candidate.log" 2>&1; then
  echo "edge: ${STACK}'s site file is invalid with the rest of the edge config — live config untouched." >&2
  tail -n 20 "$candidate.log" >&2 || true
  rm -f "$candidate.log"
  exit 1
fi
rm -f "$candidate.log"

# Atomic swap of only our file.
cp "$SOURCE" "${SITES}/${STACK}.caddy.next"
mv -f "${SITES}/${STACK}.caddy.next" "${SITES}/${STACK}.caddy"
echo "edge: installed sites/${STACK}.caddy (sha256 $(sha256sum "${SITES}/${STACK}.caddy" | cut -c1-16))"

edge_id="$(docker compose -p edge ps -q caddy 2>/dev/null | head -n1 || true)"
if [[ -z "$edge_id" ]]; then
  echo "edge: no running edge container yet (pre-cutover) — file installed, nothing reloaded."
  exit 0
fi

docker exec "$edge_id" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
host_sum="$(sha256sum "${SITES}/${STACK}.caddy" | awk '{print $1}')"
live_sum="$(docker exec "$edge_id" sha256sum "/etc/caddy/sites/${STACK}.caddy" | awk '{print $1}')"
if [[ "$host_sum" != "$live_sum" ]]; then
  echo "edge: the running edge does not see this stack's new file (host ${host_sum:0:16}, container ${live_sum:0:16})." >&2
  exit 1
fi
echo "edge: reloaded; ${STACK}.caddy live (sha256 ${host_sum:0:16})."

#!/usr/bin/env bash
#
# Publish ONE stack's site file on the shared edge (#770). Runs ON the VPS.
#
#   infra/edge/scripts/edge-deploy-site.sh <stack> <site-file>
#   e.g. edge-deploy-site.sh asafarim-com infra/edge/caddy/sites/asafarim-com.caddy
#
# The whole publish runs under ONE exclusive lock on ${EDGE_DIR}/.deploy.lock,
# so two stacks deploying at the same moment can't each validate against the
# other's OLD file and leave an unvalidated combination on disk:
#
# 1. Validate the WHOLE edge config with this stack's file swapped in, in a
#    throwaway container. Invalid → the live config is untouched, only this
#    stack's deploy fails (exit 1).
# 2. Keep the current file as sites/<stack>.caddy.prev, then swap the new one
#    in atomically.
# 3. `caddy reload` the running edge (graceful) and check the in-container
#    sha256 of this stack's file matches the host's (the #733 lesson). If the
#    reload or the check fails, the previous file is restored (or the new one
#    removed, on a first deploy) and the edge reloaded again, so the disk always
#    equals a validated config; exit 1 either way.
#    Before the cutover (no edge container yet) step 3 only installs the file.
set -euo pipefail

STACK="${1:?usage: edge-deploy-site.sh <stack> <site-file>}"
SOURCE="${2:?usage: edge-deploy-site.sh <stack> <site-file>}"
EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"
CADDY_IMAGE="${EDGE_CADDY_IMAGE:-caddy:2.11.4}"
LOCK_WAIT="${EDGE_LOCK_WAIT_SECONDS:-300}"
SITES="${EDGE_DIR}/caddy/sites"

if [[ ! "$STACK" =~ ^[a-z0-9-]+$ ]]; then
  echo "edge: invalid stack name '$STACK'" >&2
  exit 2
fi
[[ -f "$SOURCE" ]] || { echo "edge: no site file at $SOURCE" >&2; exit 2; }
[[ -f "${EDGE_DIR}/caddy/Caddyfile" ]] || { echo "edge: ${EDGE_DIR}/caddy/Caddyfile missing (edge not installed)" >&2; exit 2; }
mkdir -p "$SITES"

# One publish at a time, across every stack: validate → swap → reload → verify.
exec 9>"${EDGE_DIR}/.deploy.lock"
if ! flock -w "$LOCK_WAIT" 9; then
  echo "edge: another stack's publish still holds ${EDGE_DIR}/.deploy.lock after ${LOCK_WAIT}s — nothing changed." >&2
  exit 75
fi

LIVE="${SITES}/${STACK}.caddy"
PREV="${LIVE}.prev"

# 1. Validate a candidate copy of the whole config: everything live, plus ours.
candidate="$(mktemp -d)"
trap 'rm -rf "$candidate" "$candidate.log"' EXIT
cp -R "${EDGE_DIR}/caddy/." "$candidate/"
mkdir -p "$candidate/sites"
cp "$SOURCE" "$candidate/sites/${STACK}.caddy"
if ! docker run --rm -v "$candidate:/etc/caddy:ro" -w /etc/caddy "$CADDY_IMAGE" \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$candidate.log" 2>&1; then
  echo "edge: ${STACK}'s site file is invalid with the rest of the edge config — live config untouched." >&2
  tail -n 20 "$candidate.log" >&2 || true
  exit 1
fi

# 2. Keep what is live now, then swap only our file in atomically.
had_prev=false
if [[ -f "$LIVE" ]]; then
  cp -p "$LIVE" "$PREV"
  had_prev=true
fi
cp "$SOURCE" "${LIVE}.next"
mv -f "${LIVE}.next" "$LIVE"
echo "edge: installed sites/${STACK}.caddy (sha256 $(sha256sum "$LIVE" | cut -c1-16))"

edge_id="$(docker compose -p edge ps -q caddy 2>/dev/null | head -n1 || true)"
if [[ -z "$edge_id" ]]; then
  echo "edge: no running edge container yet (pre-cutover) — file installed, nothing reloaded."
  exit 0
fi

reload() { docker exec "$edge_id" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; }

# Put the previous file back (or take ours out on a first deploy), reload, and
# fail: the disk must always hold a config the edge accepted.
restore_and_fail() {
  local reason="$1"
  echo "edge: ${reason} — restoring the previous sites/${STACK}.caddy." >&2
  if [[ "$had_prev" == true ]]; then
    mv -f "$PREV" "$LIVE"
  else
    rm -f "$LIVE"
  fi
  if ! reload; then
    echo "edge: reload after the restore failed too; the edge keeps running its last loaded config. Investigate now." >&2
  fi
  exit 1
}

# 3. Reload and prove the running edge sees this exact file.
reload || restore_and_fail "caddy reload failed"
host_sum="$(sha256sum "$LIVE" | awk '{print $1}')"
live_sum="$(docker exec "$edge_id" sha256sum "/etc/caddy/sites/${STACK}.caddy" | awk '{print $1}' || true)"
if [[ "$host_sum" != "$live_sum" ]]; then
  restore_and_fail "the running edge does not see this stack's new file (host ${host_sum:0:16}, container ${live_sum:0:16})"
fi
echo "edge: reloaded; ${STACK}.caddy live (sha256 ${host_sum:0:16}); previous kept as ${STACK}.caddy.prev."

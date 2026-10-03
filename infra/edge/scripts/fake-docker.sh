#!/usr/bin/env bash
# Test double for `docker`, used by edge-deploy-site.test.mjs only.
#
#   FAKE_LOG                  every call is appended here ("<epoch-ms> <event>")
#   FAKE_EDGE_ID              printed by `docker compose -p edge ps -q caddy` (empty = no edge)
#   FAKE_VALIDATE_SLEEP       seconds `caddy validate` takes
#   FAKE_RELOAD_FAIL_TIMES    fail this many `caddy reload` calls, then succeed
#   FAKE_STALE_HASH=1         `sha256sum` inside the edge reports a different hash
#   EDGE_DIR                  where /etc/caddy of the "running edge" lives on the host
# A site file containing the word INVALID fails validation.
set -uo pipefail
log() { printf '%s %s\n' "$(date +%s%3N)" "$*" >>"$FAKE_LOG"; }

case "${1:-}" in
  run)
    mount=""
    while (($#)); do
      if [[ "$1" == "-v" ]]; then mount="${2%%:*}"; shift; fi
      shift
    done
    log "validate-start"
    sleep "${FAKE_VALIDATE_SLEEP:-0}"
    if grep -rqs INVALID "$mount/sites"; then
      log "validate-end invalid"
      echo "Error: adapting config: invalid site" >&2
      exit 1
    fi
    log "validate-end ok"
    ;;
  compose)
    [[ -n "${FAKE_EDGE_ID:-}" ]] && echo "$FAKE_EDGE_ID"
    ;;
  exec)
    shift 2 # exec <id>
    if [[ "$1" == "caddy" && "$2" == "reload" ]]; then
      counter="${FAKE_LOG}.reloads"
      n=$(($(cat "$counter" 2>/dev/null || echo 0) + 1))
      echo "$n" >"$counter"
      if ((n <= ${FAKE_RELOAD_FAIL_TIMES:-0})); then
        log "reload-fail"
        exit 1
      fi
      log "reload-ok"
    elif [[ "$1" == "sha256sum" ]]; then
      host_path="${EDGE_DIR}/caddy/${2#/etc/caddy/}"
      log "hash-check"
      if [[ "${FAKE_STALE_HASH:-0}" == 1 ]]; then
        echo "0000000000000000000000000000000000000000000000000000000000000000  $2"
      else
        sha256sum "$host_path" | sed "s#  .*#  $2#"
      fi
    fi
    ;;
  *)
    echo "fake docker: unexpected call: $*" >&2
    exit 99
    ;;
esac

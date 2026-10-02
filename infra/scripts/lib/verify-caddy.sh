# Shared by vps-deploy.sh and caddy-recreate.sh — sourced, not executed.
#
# Defines verify_caddy_config(), which proves the running Caddy serves the
# Caddyfile in this checkout (#733). Callers must `cd` to the repo root and
# define COMPOSE (the docker compose command array) first.
#
# Production once ran a 2026-09-18 Caddyfile for two weeks: the file was
# bind-mounted on its own, `git` replaced it with a new inode, and the mount
# stayed pinned to the old one, so every `caddy reload` re-read stale config
# and logged "config is unchanged". The directory mount fixes the cause; this
# check makes any recurrence fail the deploy instead of passing silently.
#
# Returns non-zero with a reason on stderr; prints nothing else on failure.
verify_caddy_config() {
  local host_sum container_sum code path

  host_sum="$(sha256sum infra/caddy/Caddyfile | awk '{print $1}')"
  container_sum="$("${COMPOSE[@]}" exec -T caddy sha256sum /etc/caddy/Caddyfile | awk '{print $1}')" || container_sum=""
  echo "Caddyfile sha256: host ${host_sum}, container ${container_sum:-<unreadable>}"
  if [[ -z "${container_sum}" || "${host_sum}" != "${container_sum}" ]]; then
    echo "Caddy is not serving this checkout's Caddyfile. If its container still has the" >&2
    echo "old single-file mount, recreate it once at a quiet moment:" >&2
    echo "  infra/scripts/caddy-recreate.sh --yes" >&2
    return 1
  fi

  # The runner protocol must never be reachable through the public proxy
  # (#718, ADR 0004 §1). A 404 here comes from Caddy; the app answers 401/503.
  for path in /internal/runner/lease /INTERNAL/x /%69nternal/runner/lease; do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 -X POST "https://testora.asafarim.com${path}")" || code="000"
    echo "POST https://testora.asafarim.com${path} -> ${code}"
    if [[ "${code}" != 404 ]]; then
      echo "Public ${path} returned ${code}, expected 404 from Caddy." >&2
      return 1
    fi
  done

  # The app may still be starting after `up -d`; Caddy then serves its 50x
  # "deploying" page. Allow it about a minute.
  local attempt
  for attempt in $(seq 1 12); do
    code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 15 https://testora.asafarim.com/api/status)" || code="000"
    [[ "${code}" == 200 ]] && break
    sleep 5
  done
  echo "GET https://testora.asafarim.com/api/status -> ${code}"
  if [[ "${code}" != 200 ]]; then
    echo "Public /api/status returned ${code}, expected 200 from the app." >&2
    return 1
  fi
}

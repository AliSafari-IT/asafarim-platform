#!/usr/bin/env bash
#
# igs-pharma.be staging health check (asafarim-platform#828, roadmap IGS-D8).
# Runs ON the VPS every 2 minutes, from the igs-healthcheck.timer systemd unit that
# igs-deploy.sh installs. It checks:
#   - igs-web and igs-platform /api/health, from inside their containers (the
#     platform is IP-allowlisted at the edge), as igs-deploy.sh's ready() does;
#   - https://igs-pharma.be/api/health from outside, through the edge;
#   - that igs-postgres and igs-worker are running.
# It alerts to Discord on a state CHANGE only: healthy -> unhealthy (one alert)
# and back (one recovery message). The last state lives in
# ${IGS_HEALTH_STATE_DIR:-/var/lib/igs-health}/state.
#
# The webhook is IGS_ALERT_WEBHOOK_DISCORD in the igs env (infra/igs/.env.igs,
# decrypted by igs-deploy.sh). Unset, a placeholder or not a Discord webhook URL:
# the script only logs. The URL is never printed, and it reaches curl on stdin,
# not on its command line.
#
# Sourcing this file only defines the functions (tests:
# infra/igs/igs-deploy.test.mjs).
set -euo pipefail

IGS_PUBLIC_HEALTH_URL="${IGS_PUBLIC_HEALTH_URL:-https://igs-pharma.be/api/health}"

log() { echo "[igs-healthcheck] $*"; }

# The running container of one igs compose service, or nothing.
igs_container() { # <service>
  local out
  out="$(docker ps -q --filter "label=com.docker.compose.project=igs" \
    --filter "label=com.docker.compose.service=$1" --filter "status=running")" || return 1
  printf '%s' "${out%%$'\n'*}"
}

# /api/health answers 200 inside the service's container.
igs_inner_health() { # <service> <port>
  local id
  id="$(igs_container "$1")"
  [[ -n "$id" ]] || return 1
  docker exec "$id" node -e \
    "fetch('http://127.0.0.1:$2/api/health',{signal:AbortSignal.timeout(10000)}).then(r=>process.exit(r.status===200?0:1),()=>process.exit(1))" \
    >/dev/null 2>&1
}

# Prints one line per failed check; nothing when everything is healthy.
igs_health_problems() {
  local svc code
  for svc in igs-postgres igs-worker; do
    [[ -n "$(igs_container "$svc")" ]] || echo "${svc} is not running"
  done
  igs_inner_health igs-web 3000 || echo "igs-web /api/health is not 200 (inside the container)"
  igs_inner_health igs-platform 3001 || echo "igs-platform /api/health is not 200 (inside the container)"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 --retry 2 --retry-delay 5 \
    "$IGS_PUBLIC_HEALTH_URL" 2>/dev/null)" || true
  [[ "$code" == "200" ]] || echo "${IGS_PUBLIC_HEALTH_URL} answered ${code:-nothing}, not 200"
}

# What to send for the new state ("ok" or "down") given the recorded one:
# "alert" (it just went down, or it is down on the first run), "recover" (it
# just came back) or "none" (no change).
igs_health_transition() { # <state-file> <ok|down>
  local file="$1" new="$2" old=""
  if [[ -f "$file" ]]; then old="$(<"$file")"; fi
  if [[ "$new" == "down" && "$old" != "down" ]]; then
    echo alert
  elif [[ "$new" == "ok" && "$old" == "down" ]]; then
    echo recover
  else
    echo none
  fi
}

igs_health_record() { # <state-file> <ok|down>
  printf '%s\n' "$2" >"${1}.tmp" && mv -f "${1}.tmp" "$1"
}

# The webhook URL, only if it really is a Discord webhook (else nothing).
igs_alert_webhook() { # <env-file>
  local line value
  [[ -r "$1" ]] || return 0
  line="$(grep -E '^IGS_ALERT_WEBHOOK_DISCORD=' "$1" | tail -n 1)" || return 0
  value="${line#*=}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  if [[ "$value" =~ ^https://(discord\.com|discordapp\.com)/api/webhooks/[A-Za-z0-9_/-]+$ ]]; then
    printf '%s' "$value"
  fi
}

# A JSON string literal (backslashes, quotes and newlines escaped).
igs_json_string() {
  local s="$1"
  s="${s//\\/\\\\}"
  s="${s//\"/\\\"}"
  s="${s//$'\n'/\\n}"
  printf '"%s"' "$s"
}

# Posts to Discord; the URL goes to curl through a config on stdin. Fails unless
# Discord answers 2xx (--fail), so a rate limit, a revoked webhook or an outage
# is retried instead of counted as sent.
igs_notify() { # <webhook> <message>
  local body
  body="{\"content\":$(igs_json_string "$2")}"
  printf 'url = "%s"\n' "$1" |
    curl -sS --fail -o /dev/null --max-time 15 -X POST -H "Content-Type: application/json" \
      --data-binary "$body" -K - 2>/dev/null
}

igs_healthcheck_main() {
  local repo_dir="${REPO_DIR:-/var/repos/asafarim-com}"
  local state_dir="${IGS_HEALTH_STATE_DIR:-/var/lib/igs-health}"
  local problems state action webhook message
  mkdir -p "$state_dir"

  problems="$(igs_health_problems)"
  if [[ -z "$problems" ]]; then state=ok; else state=down; fi
  action="$(igs_health_transition "${state_dir}/state" "$state")"

  if [[ "$state" == ok ]]; then log "healthy"; else log "UNHEALTHY: ${problems//$'\n'/; }"; fi
  if [[ "$action" == none ]]; then
    igs_health_record "${state_dir}/state" "$state"
    return 0
  fi

  if [[ "$action" == alert ]]; then
    message="🔴 igs-pharma.be staging is unhealthy:"$'\n'"$(sed 's/^/- /' <<<"$problems")"
  else
    message="🟢 igs-pharma.be staging has recovered: every check passes again."
  fi
  webhook="$(igs_alert_webhook "${repo_dir}/infra/igs/.env.igs")"
  if [[ -z "$webhook" ]]; then
    log "no IGS_ALERT_WEBHOOK_DISCORD set; not sending the ${action} message"
    igs_health_record "${state_dir}/state" "$state"
    return 0
  fi
  if igs_notify "$webhook" "$message"; then
    log "sent the ${action} message to Discord"
    igs_health_record "${state_dir}/state" "$state"
  else
    # The state stays as it was, so the next run tries again.
    log "could not send the ${action} message to Discord; retrying on the next run"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  igs_healthcheck_main
fi

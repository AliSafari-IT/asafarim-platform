#!/usr/bin/env bash
#
# igs-pharma.be staging health check (asafarim-platform#828, roadmap IGS-D8).
# Runs ON the VPS every 2 minutes, from the igs-healthcheck.timer systemd unit that
# igs-deploy.sh installs. It checks:
#   - igs-web and igs-platform /api/health, from inside their containers (the
#     platform is IP-allowlisted at the edge), as igs-deploy.sh's ready() does;
#   - https://igs-pharma.be/api/health from outside, through the edge;
#   - that igs-postgres and igs-worker are running.
# It alerts on a state CHANGE only: healthy -> unhealthy (one alert) and back
# (one recovery message). The last state lives in
# ${IGS_HEALTH_STATE_DIR:-/var/lib/igs-health}/state.
#
# Two channels, either or both, set in the igs env (infra/igs/.env.igs,
# decrypted by igs-deploy.sh):
#   - Discord: IGS_ALERT_WEBHOOK_DISCORD, a Discord webhook URL;
#   - Telegram: IGS_ALERT_TELEGRAM_TOKEN (the bot token from @BotFather) and
#     IGS_ALERT_TELEGRAM_CHAT_ID (a user, group or channel id).
# With neither set (or a placeholder, or a malformed value) the script only logs.
# The webhook URL and the bot token are never printed, and reach curl on stdin,
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

# One KEY=value from a dotenv file, one pair of surrounding quotes stripped.
igs_dotenv_value() { # <env-file> <key>
  local line value
  [[ -r "$1" ]] || return 0
  line="$(grep -E "^${2}=" "$1" | tail -n 1)" || return 0
  value="${line#*=}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  printf '%s' "$value"
}

# The webhook URL, only if it really is a Discord webhook (else nothing).
igs_alert_webhook() { # <env-file>
  local value
  value="$(igs_dotenv_value "$1" IGS_ALERT_WEBHOOK_DISCORD)"
  if [[ "$value" =~ ^https://(discord\.com|discordapp\.com)/api/webhooks/[A-Za-z0-9_/-]+$ ]]; then
    printf '%s' "$value"
  fi
}

# "<sendMessage URL> <chat id>", only if the bot token and the chat id both look
# right (else nothing). The URL carries the token: treat it like a secret.
igs_alert_telegram() { # <env-file>
  local token chat
  token="$(igs_dotenv_value "$1" IGS_ALERT_TELEGRAM_TOKEN)"
  chat="$(igs_dotenv_value "$1" IGS_ALERT_TELEGRAM_CHAT_ID)"
  if [[ "$token" =~ ^[0-9]{6,}:[A-Za-z0-9_-]{30,}$ && "$chat" =~ ^-?[0-9]+$ ]]; then
    printf 'https://api.telegram.org/bot%s/sendMessage %s' "$token" "$chat"
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

# Posts to Telegram: the sendMessage URL (it carries the bot token) goes to curl
# through a config on stdin. Fails unless Telegram answers 2xx, like igs_notify.
igs_notify_telegram() { # <sendMessage URL> <chat id> <message>
  local body
  body="{\"chat_id\":$(igs_json_string "$2"),\"text\":$(igs_json_string "$3")}"
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
  local env_file="${repo_dir}/infra/igs/.env.igs" telegram tg_url tg_chat configured=0 sent=0
  webhook="$(igs_alert_webhook "$env_file")"
  telegram="$(igs_alert_telegram "$env_file")"
  if [[ -z "$webhook" && -z "$telegram" ]]; then
    log "no IGS_ALERT_WEBHOOK_DISCORD or IGS_ALERT_TELEGRAM_TOKEN/CHAT_ID set; not sending the ${action} message"
    igs_health_record "${state_dir}/state" "$state"
    return 0
  fi
  if [[ -n "$webhook" ]]; then
    configured=$((configured + 1))
    if igs_notify "$webhook" "$message"; then
      log "sent the ${action} message to Discord"
      sent=$((sent + 1))
    else
      log "could not send the ${action} message to Discord"
    fi
  fi
  if [[ -n "$telegram" ]]; then
    tg_url="${telegram%% *}"
    tg_chat="${telegram#* }"
    configured=$((configured + 1))
    if igs_notify_telegram "$tg_url" "$tg_chat" "$message"; then
      log "sent the ${action} message to Telegram"
      sent=$((sent + 1))
    else
      log "could not send the ${action} message to Telegram"
    fi
  fi
  if ((sent > 0)); then
    igs_health_record "${state_dir}/state" "$state"
  else
    # The state stays as it was, so the next run tries again.
    log "no channel took the ${action} message (${configured} tried); retrying on the next run"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  igs_healthcheck_main
fi

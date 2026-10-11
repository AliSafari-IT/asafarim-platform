#!/usr/bin/env bash
# igs-pharma.be staging (#822): helpers for igs-deploy.sh, sourced (not executed).
# Tests: infra/igs/igs-deploy.test.mjs.
#
#   igs_require_sha <sha>           a FULL 40-character commit SHA, or fail
#   igs_env_value <file> <key>      one KEY=value from a dotenv file (no `source`:
#                                   values may contain $ or quotes)
#   igs_allowlist <raw>             validate IGS_PLATFORM_ALLOW_IPS (IPv4/IPv6 CIDRs,
#                                   comma- or space-separated); prints them space-separated
#   igs_render_site <template> <allowlist> <out>
#                                   the site file with the allowlist filled in
#   igs_app_env <full> <out>        the apps' env: the env file without its IGS_*
#                                   keys (deploy-only: the migrator's connection, the
#                                   Postgres password and the allowlist never reach an app)
#   igs_publish_live <rendered>     BEFORE the edge cutover only: install the site file
#                                   for the Caddy that owns 443 today (asafarim-com's),
#                                   validate → swap → reload → verify, restore on failure
#
# Expects REPO_DIR (the asafarim-com checkout) for igs_publish_live.

IGS_ALLOWLIST_TOKEN='{$IGS_PLATFORM_ALLOW_IPS}'

igs_require_sha() {
  local sha="${1:-}"
  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    echo "igs: '${sha}' is not a full 40-character commit SHA. The igs-pharma images are tagged with the full SHA of an igs-pharma main commit (no short SHAs, no 'latest')." >&2
    return 2
  fi
}

igs_env_value() {
  local file="$1" key="$2" line value
  line="$(grep -E "^${key}=" "$file" | tail -n 1)" || return 1
  value="${line#*=}"
  # Strip one pair of surrounding quotes, as dotenv does.
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  printf '%s' "$value"
}

_igs_valid_v4() {
  local cidr="$1" ip prefix o
  [[ "$cidr" =~ ^([0-9]{1,3}(\.[0-9]{1,3}){3})/([0-9]{1,2})$ ]] || return 1
  ip="${BASH_REMATCH[1]}"
  prefix="${BASH_REMATCH[3]}"
  ((10#$prefix >= 1 && 10#$prefix <= 32)) || return 1
  for o in ${ip//./ }; do ((10#$o <= 255)) || return 1; done
}

_igs_valid_v6() {
  local cidr="$1" prefix
  [[ "$cidr" =~ ^([0-9A-Fa-f:]+)/([0-9]{1,3})$ ]] || return 1
  [[ "${BASH_REMATCH[1]}" == *:* ]] || return 1
  prefix="${BASH_REMATCH[2]}"
  ((10#$prefix >= 1 && 10#$prefix <= 128))
}

igs_allowlist() {
  local raw="${1:-}" entry valid=()
  raw="${raw//,/ }"
  for entry in $raw; do
    if _igs_valid_v4 "$entry" || _igs_valid_v6 "$entry"; then
      valid+=("$entry")
    else
      # Never echo the value back: this runs in deploy logs.
      echo "igs: IGS_PLATFORM_ALLOW_IPS has an entry that is not an IPv4 or IPv6 CIDR with a prefix of /1 or more (e.g. 203.0.113.7/32, 2001:db8:1::/64). A /0 would allow everyone." >&2
      return 1
    fi
  done
  if ((${#valid[@]} == 0)); then
    echo "igs: IGS_PLATFORM_ALLOW_IPS is empty. Set at least one CIDR in the igs env, or nobody can reach platform.igs-pharma.be." >&2
    return 1
  fi
  printf '%s' "${valid[*]}"
}

igs_render_site() {
  local template="$1" allowlist="$2" out="$3" text
  text="$(<"$template")"
  if [[ "$text" != *"$IGS_ALLOWLIST_TOKEN"* ]]; then
    echo "igs: ${template} has no ${IGS_ALLOWLIST_TOKEN} placeholder." >&2
    return 1
  fi
  printf '%s\n' "${text//"$IGS_ALLOWLIST_TOKEN"/$allowlist}" >"$out"
}

igs_app_env() {
  local full="$1" out="$2"
  (umask 077 && grep -Ev '^[[:space:]]*IGS_[A-Z0-9_]*=' "$full" >"$out" || true)
}

igs_publish_live() {
  local rendered="$1" live_id image dir candidate dest prev had_prev=false host_sum live_sum
  dir="${REPO_DIR}/infra/caddy"
  dest="${dir}/sites.local/igs-pharma.caddy"
  prev="${dest}.prev"
  live_id="$(docker ps -q --filter label=com.docker.compose.project=asafarim-com --filter label=com.docker.compose.service=caddy | head -n 1)"
  if [[ -z "$live_id" ]]; then
    echo "igs: no running asafarim-com Caddy and no edge container: nothing serves 443." >&2
    return 1
  fi
  if ! docker inspect -f '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}} {{end}}' "$live_id" | grep -qw edge_net; then
    echo "igs: the live Caddy is not on edge_net, so it can't reach igs-web/igs-platform. Once, with no restart:" >&2
    echo "  docker network connect edge_net ${live_id:0:12}" >&2
    return 1
  fi

  (
    exec 9>"${REPO_DIR}/.igs-live-site.lock"
    flock -w 300 9 || { echo "igs: live site lock busy" >&2; exit 75; }

    # 1. Validate the WHOLE live config with our file in, with the live Caddy's image.
    candidate="$(mktemp -d)"
    trap 'rm -rf "$candidate"' EXIT
    cp -R "${dir}/." "$candidate/"
    mkdir -p "$candidate/sites.local"
    cp "$rendered" "$candidate/sites.local/igs-pharma.caddy"
    image="$(docker inspect -f '{{.Config.Image}}' "$live_id")"
    if ! docker run --rm -v "$candidate:/etc/caddy:ro" "$image" \
        caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$candidate.log" 2>&1; then
      echo "igs: the site file is invalid with the live Caddy config; live config untouched." >&2
      tail -n 20 "$candidate.log" >&2 || true
      rm -f "$candidate.log"
      exit 1
    fi
    rm -f "$candidate.log"

    # 2. Swap atomically, keeping the previous file.
    mkdir -p "${dir}/sites.local"
    if [[ -f "$dest" ]]; then cp -p "$dest" "$prev"; had_prev=true; fi
    cp "$rendered" "${dest}.next"
    mv -f "${dest}.next" "$dest"

    restore() {
      echo "igs: $1; restoring the previous live site file." >&2
      if [[ "$had_prev" == true ]]; then mv -f "$prev" "$dest"; else rm -f "$dest"; fi
      docker exec "$live_id" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile ||
        echo "igs: reload after the restore failed too; the live Caddy keeps its last loaded config. Investigate now." >&2
      exit 1
    }

    # 3. Graceful reload, then prove the running Caddy reads this exact file.
    docker exec "$live_id" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile || restore "caddy reload failed"
    host_sum="$(sha256sum "$dest" | awk '{print $1}')"
    live_sum="$(docker exec "$live_id" sha256sum /etc/caddy/sites.local/igs-pharma.caddy | awk '{print $1}' || true)"
    [[ "$host_sum" == "$live_sum" ]] || restore "the live Caddy does not see the new file"
    echo "igs: live Caddy serves sites.local/igs-pharma.caddy (sha256 ${host_sum:0:16})"
  )
}

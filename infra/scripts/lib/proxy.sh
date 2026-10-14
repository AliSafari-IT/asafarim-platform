#!/usr/bin/env bash
# Which Caddy a deploy talks to (#770 phase 3, the edge cutover). Sourced by
# vps-deploy.sh, after verify-caddy.sh and edge.sh, with COMPOSE and
# notify_discord defined.
#
# BEFORE the cutover asafarim-com's own Caddy owns 80/443: a deploy starts it
# (never recreating it, #733), validates and gracefully reloads
# infra/caddy/Caddyfile, proves it serves this checkout's file, and publishes
# the edge site file as a warn-only rehearsal.
#
# AFTER the cutover the shared edge owns 80/443 and asafarim-com's Caddy is
# stopped. Starting it again would fight the edge for the ports, and
# `compose exec caddy` would fail on a stopped container, so every push to main
# would abort. A deploy then publishes sites/asafarim-com.caddy to the edge
# (validate the whole edge config, swap, reload, prove the running edge sees
# the file) and checks the public routes. That publish is the live proxy now, so
# its failure fails the deploy.
#
# Both functions take whether the edge is live ("true"/"false") as their first
# argument: vps-deploy.sh decides it once per deploy, with edge_is_live, so the
# two steps agree.

start_legacy_caddy() {
  local edge_live="${1:?start_legacy_caddy <true|false>}"
  if [[ "${edge_live}" == true ]]; then
    echo "[deploy $(date -Is)] The shared edge is live: asafarim-com's own Caddy stays stopped (it would fight the edge for 80/443)."
    return 0
  fi
  "${COMPOSE[@]}" up -d --no-build --no-recreate caddy
}

apply_proxy_config() {
  local edge_live="${1:?apply_proxy_config <true|false>}"
  if [[ "${edge_live}" == true ]]; then
    echo "[deploy $(date -Is)] Publishing sites/asafarim-com.caddy to the live shared edge..."
    if ! install_edge_project || ! publish_edge_site; then
      echo "FATAL: the shared edge did not accept this release's site file — it keeps serving the previous config." >&2
      notify_discord "❌ ASafariM deploy ${IMAGE_TAG:0:12}: the live shared edge refused sites/asafarim-com.caddy. The edge keeps its previous config. See the deploy log."
      return 1
    fi
    echo "[deploy $(date -Is)] Verifying the public routes..."
    if ! verify_public_routes; then
      echo "FATAL: the public routes do not answer as expected through the shared edge." >&2
      notify_discord "❌ ASafariM deploy ${IMAGE_TAG:0:12}: the public route check FAILED through the shared edge. See the deploy log."
      return 1
    fi
    return 0
  fi

  # The Caddy directory is bind-mounted, so applying configuration does not require a
  # container replacement. Force-recreating Caddy briefly closes public ports 80
  # and 443; visitors then see the browser's ERR_CONNECTION_TIMED_OUT page and
  # Caddy cannot serve the friendly 502/503/504 deployment fallback. Validate the
  # new file first, then reload it inside the existing process. `caddy reload`
  # swaps configuration gracefully without interrupting active listeners.
  echo "[deploy $(date -Is)] Validating and gracefully reloading Caddy..."
  if ! "${COMPOSE[@]}" exec -T caddy \
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile; then
    echo "FATAL: Caddy configuration is invalid — keeping the current proxy configuration." >&2
    return 1
  fi
  # Check it explicitly: vps-deploy.sh calls this function inside `|| exit 1`, where
  # `set -e` does not apply, so an unchecked failure here would let the deploy go on
  # and report success while Caddy still serves the old configuration.
  if ! "${COMPOSE[@]}" exec -T caddy \
    caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; then
    echo "FATAL: Caddy did not reload — it keeps serving the previous configuration." >&2
    notify_discord "❌ ASafariM deploy ${IMAGE_TAG:0:12}: Caddy reload FAILED — the live proxy keeps its previous configuration. See the deploy log."
    return 1
  fi

  # A reload that reads a stale file still succeeds ("config is unchanged"), so
  # prove the running Caddy has this checkout's Caddyfile and blocks /internal/*.
  echo "[deploy $(date -Is)] Verifying the live Caddy configuration..."
  if ! verify_caddy_config; then
    echo "FATAL: Caddy is not serving this release's configuration." >&2
    notify_discord "❌ ASafariM deploy ${IMAGE_TAG:0:12}: Caddy config check FAILED — the live proxy is not serving this release's Caddyfile. See the deploy log."
    return 1
  fi

  # Shared edge, phase 2 (#770): install the edge project and publish this
  # stack's site file. Before the cutover there is no edge container, so this
  # validates the WHOLE edge config with this release's file and installs it,
  # nothing more. Warn-only until the cutover makes the edge the live proxy.
  echo "[deploy $(date -Is)] Publishing sites/asafarim-com.caddy to the shared edge..."
  if ! install_edge_project || ! publish_edge_site; then
    echo "WARNING: the shared edge did not accept this release's site file (pre-cutover: production traffic is unaffected)." >&2
    notify_discord "⚠️ ASafariM deploy ${IMAGE_TAG:0:12}: the shared edge refused sites/asafarim-com.caddy (pre-cutover, traffic unaffected). See the deploy log."
  fi
  return 0
}

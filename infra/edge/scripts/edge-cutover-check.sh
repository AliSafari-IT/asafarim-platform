#!/usr/bin/env bash
#
# The edge cutover check (#770 phase 3, #839). Runs ON the VPS, as often as you like. It is READ-ONLY: it never
# stops, starts, reloads or writes anything on the server. The only file it ever writes is the one you name with
# --snapshot.
#
#   infra/edge/scripts/edge-cutover-check.sh                        the check: prints a table and PASS or FAIL
#   infra/edge/scripts/edge-cutover-check.sh --snapshot <file>      the check, then a host-by-host snapshot of what
#                                                                   the public sees (HTTP status, certificate expiry)
#   infra/edge/scripts/edge-cutover-check.sh --compare <before> <after>
#                                                                   the differences between two snapshots
#
# The check compares the two configurations BY HOST NAME, not by file (the same host can be defined in different
# files on each side):
#   - the LIVE one: the Caddy that owns 80/443 today (asafarim-com's: infra/caddy/Caddyfile, which also imports the
#     sites.local/ files that igs-pharma and the OS landing page install there before the cutover);
#   - the EDGE one: the combined config of the shared edge (<edge dir>/caddy/Caddyfile, which imports sites/*.caddy).
# It then checks that
#   1. every host the live Caddy serves is served by the edge, and the other way round (a host missing on either
#      side fails the check);
#   2. every file in the live Caddy's sites.local/ has an identical copy in the edge's sites/ (those stacks must
#      be carried over, or their sites would go dark);
#   3. the edge's combined config passes `caddy validate`;
# and prints which process owns ports 80 and 443 today.
#
# Everything that reads a configuration runs `caddy adapt` or `caddy validate` in a throwaway container, with no
# network and the config mounted read-only. The snapshot makes one plain GET of https://<host>/ per host and reads its
# certificate, like any visitor; it follows no redirect and sends no data.
#
# Where things are (override with the environment):
#   LIVE_DIR     the live Caddy's config folder     default: infra/caddy of the checkout this script is in
#   EDGE_DIR     the shared edge's folder           default: /var/repos/edge
#   CADDY_IMAGE  the Caddy image for adapt/validate default: the one in <EDGE_DIR>/docker-compose.yml
#
# Exit status: 0 PASS (or no differences), 1 FAIL, 2 usage or missing tool.
set -uo pipefail

WORK_DIR=""

usage() {
  cat >&2 <<'USAGE'
usage: edge-cutover-check.sh [--snapshot <file>]
       edge-cutover-check.sh --compare <before-file> <after-file>
USAGE
  exit 2
}

main() {
  local script_dir snapshot="" compare_before="" compare_after=""
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  while (($#)); do
    case "$1" in
      --snapshot)
        [[ $# -ge 2 ]] || usage
        snapshot="$2"
        shift 2
        ;;
      --compare)
        [[ $# -ge 3 ]] || usage
        compare_before="$2"
        compare_after="$3"
        shift 3
        ;;
      *) usage ;;
    esac
  done

  if [[ -n "$compare_before" ]]; then
    [[ -z "$snapshot" ]] || usage
    compare_snapshots "$compare_before" "$compare_after"
    return
  fi

  LIVE_DIR="${LIVE_DIR:-$(cd "${script_dir}/../../caddy" && pwd)}"
  EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"
  command -v docker >/dev/null 2>&1 || { echo "FATAL: 'docker' is not installed on this host." >&2; exit 2; }
  [[ -f "${LIVE_DIR}/Caddyfile" ]] || { echo "FATAL: ${LIVE_DIR}/Caddyfile not found (set LIVE_DIR to the live Caddy's folder)." >&2; exit 2; }
  [[ -f "${EDGE_DIR}/caddy/Caddyfile" ]] || { echo "FATAL: ${EDGE_DIR}/caddy/Caddyfile not found (the edge is not installed; set EDGE_DIR)." >&2; exit 2; }
  CADDY_IMAGE="${CADDY_IMAGE:-$(sed -n 's/^[[:space:]]*image:[[:space:]]*\(caddy:[A-Za-z0-9._-]*\).*/\1/p' "${EDGE_DIR}/docker-compose.yml" 2>/dev/null | head -n 1)}"
  CADDY_IMAGE="${CADDY_IMAGE:-caddy:2.11.4}"

  run_check "$snapshot"
}

# ---------------------------------------------------------------------------------------------------------------
# Reading a configuration. Both functions run Caddy in a throwaway container: no network, the folder read-only.

caddy_in_container() { # <folder> <caddy args...>
  local dir="$1"
  shift
  docker run --rm --network none -v "${dir}:/etc/caddy:ro" -w /etc/caddy "$CADDY_IMAGE" caddy "$@"
}

# The host names a configuration serves, one per line, sorted. `caddy adapt` prints compact JSON, where every
# host matcher is written "host":["a","b"].
hosts_of() { # <folder> <error-log>
  local json
  if ! json="$(caddy_in_container "$1" adapt --config /etc/caddy/Caddyfile --adapter caddyfile 2>"$2")"; then
    return 1
  fi
  printf '%s' "$json" | grep -oE '"host":\[[^]]*\]' | grep -oE '"[^"]+"' | grep -vx '"host"' | tr -d '"' | LC_ALL=C sort -u
  return 0
}

# ---------------------------------------------------------------------------------------------------------------
# The check

run_check() { # <snapshot-file or empty>
  local problems=0 tmp
  tmp="$(mktemp -d)"
  WORK_DIR="$tmp"
  trap 'rm -rf "$WORK_DIR"' EXIT

  echo "Edge cutover check (read-only)"
  echo "  live Caddy config: ${LIVE_DIR}"
  echo "  edge config:       ${EDGE_DIR}/caddy   (${CADDY_IMAGE})"
  echo

  # 1. Hosts, by name.
  echo "Hosts (by name, whichever file defines them)"
  local live_ok=true edge_ok=true
  hosts_of "$LIVE_DIR" "$tmp/live.err" >"$tmp/live.hosts" || live_ok=false
  hosts_of "${EDGE_DIR}/caddy" "$tmp/edge.err" >"$tmp/edge.hosts" || edge_ok=false
  if [[ "$live_ok" != true ]]; then
    echo "  FAIL: the live config does not adapt:"
    tail -n 10 "$tmp/live.err" | sed 's/^/    /'
    problems=$((problems + 1))
  fi
  if [[ "$edge_ok" != true ]]; then
    echo "  FAIL: the edge config does not adapt:"
    tail -n 10 "$tmp/edge.err" | sed 's/^/    /'
    problems=$((problems + 1))
  fi
  local host in_live in_edge all_count=0
  if [[ "$live_ok" == true && "$edge_ok" == true ]]; then
    LC_ALL=C sort -u "$tmp/live.hosts" "$tmp/edge.hosts" >"$tmp/all.hosts"
    printf '  %-48s %-9s %-9s\n' "HOST" "LIVE" "EDGE"
    while IFS= read -r host; do
      [[ -n "$host" ]] || continue
      all_count=$((all_count + 1))
      in_live=MISSING
      in_edge=MISSING
      grep -qxF -- "$host" "$tmp/live.hosts" && in_live=yes
      grep -qxF -- "$host" "$tmp/edge.hosts" && in_edge=yes
      if [[ "$in_live" == yes && "$in_edge" == yes ]]; then
        printf '  %-48s %-9s %-9s\n' "$host" "$in_live" "$in_edge"
      else
        printf '  %-48s %-9s %-9s <-- FAIL: not served by the %s\n' "$host" "$in_live" "$in_edge" "$([[ "$in_edge" == MISSING ]] && echo edge || echo live Caddy)"
        problems=$((problems + 1))
      fi
    done <"$tmp/all.hosts"
  fi
  echo

  # 2. The live Caddy's sites.local/ files must exist, identical, on the edge.
  echo "Site files the live Caddy imports from sites.local/ (must have an identical copy in the edge's sites/)"
  local f name found=false
  if [[ -d "${LIVE_DIR}/sites.local" ]]; then
    for f in "${LIVE_DIR}"/sites.local/*.caddy; do
      [[ -f "$f" ]] || continue
      found=true
      name="$(basename "$f")"
      if [[ ! -f "${EDGE_DIR}/caddy/sites/${name}" ]]; then
        printf '  %-48s %s\n' "$name" "MISSING on the edge   <-- FAIL: publish it to the edge first"
        problems=$((problems + 1))
      elif cmp -s "$f" "${EDGE_DIR}/caddy/sites/${name}"; then
        printf '  %-48s %s\n' "$name" "identical"
      else
        printf '  %-48s %s\n' "$name" "DIFFERENT on the edge   <-- FAIL: publish the current one to the edge"
        problems=$((problems + 1))
      fi
    done
  fi
  [[ "$found" == true ]] || echo "  (none)"
  echo

  # 3. The edge's combined config must validate.
  echo "Edge config: caddy validate (throwaway container, no network)"
  if caddy_in_container "${EDGE_DIR}/caddy" validate --config /etc/caddy/Caddyfile --adapter caddyfile >"$tmp/validate.log" 2>&1; then
    echo "  OK"
  else
    echo "  FAIL:"
    tail -n 10 "$tmp/validate.log" | sed 's/^/    /'
    problems=$((problems + 1))
  fi
  echo

  # Who owns 80 and 443 today (information, not a pass/fail).
  echo "Who owns ports 80 and 443 today"
  report_port_owners
  echo

  if [[ -n "$1" ]]; then
    if [[ "$live_ok" == true && "$edge_ok" == true ]]; then
      write_snapshot "$1" "$tmp/all.hosts"
    else
      echo "Snapshot NOT written: the hosts could not be read (see above)."
      problems=$((problems + 1))
    fi
    echo
  fi

  if ((problems == 0)); then
    echo "PASS: all ${all_count} hosts are served by both the live Caddy and the edge, every sites.local/ file is on the edge, and the edge config is valid."
    return 0
  fi
  echo "FAIL: ${problems} problem(s). Fix them before the cutover."
  return 1
}

report_port_owners() {
  local port out any=false
  for port in 80 443; do
    out="$(docker ps --filter "publish=${port}" --format '{{.Names}} (compose project: {{.Label "com.docker.compose.project"}})' 2>/dev/null || true)"
    if [[ -n "$out" ]]; then
      any=true
      printf '  %s: %s\n' "$port" "$(printf '%s' "$out" | paste -sd ', ' -)"
    else
      printf '  %s: no Docker container publishes it\n' "$port"
    fi
  done
  if [[ "$any" == true ]]; then
    if docker ps --filter publish=443 --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | grep -qx edge; then
      echo "  => the shared edge owns 80/443 (after the cutover)."
    elif docker ps --filter publish=443 --format '{{.Label "com.docker.compose.project"}}' 2>/dev/null | grep -qx asafarim-com; then
      echo "  => the asafarim-com Caddy owns 80/443 (before the cutover)."
    else
      echo "  => an unexpected container owns 443: check before going on."
    fi
  else
    echo "  => nothing in Docker serves 80/443. A process outside Docker may (check: ss -ltnp)."
  fi
}

# ---------------------------------------------------------------------------------------------------------------
# Snapshots: what the public sees, host by host. A GET of / and the certificate, nothing else.

http_status() { # <host>
  curl -sS -o /dev/null -w '%{http_code}' --max-time 15 "https://$1/" 2>/dev/null || true
}

cert_not_after() { # <host>
  local out
  out="$(printf '' | openssl s_client -servername "$1" -connect "$1:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')" || out=""
  printf '%s' "${out:--}"
}

write_snapshot() { # <file> <hosts-file>
  local file="$1" hosts_file="$2" host status expiry
  for tool in curl openssl; do
    command -v "$tool" >/dev/null 2>&1 || { echo "FATAL: '${tool}' is needed for --snapshot and is not installed." >&2; exit 2; }
  done
  {
    printf '# edge cutover snapshot, %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '# host\thttp_status\tcertificate_not_after\n'
  } >"$file" || { echo "FATAL: cannot write ${file}." >&2; exit 2; }
  echo "Snapshot (one GET of / per host, and its certificate)"
  printf '  %-48s %-8s %s\n' "HOST" "STATUS" "CERTIFICATE EXPIRES"
  while IFS= read -r host; do
    case "$host" in "" | \** | *[!A-Za-z0-9.-]*) continue ;; esac
    status="$(http_status "$host")"
    [[ "$status" =~ ^[0-9]{3}$ ]] || status=000
    expiry="$(cert_not_after "$host")"
    printf '%s\t%s\t%s\n' "$host" "$status" "$expiry" >>"$file"
    printf '  %-48s %-8s %s\n' "$host" "$status" "$expiry"
  done <"$hosts_file"
  echo "  written to ${file}"
}

# The differences between two snapshots. A host that appeared or disappeared, or whose HTTP status changed, fails;
# a changed certificate date is a warning (a reissued certificate is not an outage, but is worth a look).
compare_snapshots() { # <before> <after>
  local before="$1" after="$2" failures=0 warnings=0 host b_status b_exp a_status a_exp rows=0
  [[ -f "$before" ]] || { echo "FATAL: ${before} not found." >&2; exit 2; }
  [[ -f "$after" ]] || { echo "FATAL: ${after} not found." >&2; exit 2; }
  echo "Snapshot comparison: ${before} -> ${after}"
  printf '  %-48s %-14s %s\n' "HOST" "STATUS" "CERTIFICATE EXPIRES"
  local hosts
  hosts="$(grep -hv '^#' "$before" "$after" | cut -f1 | LC_ALL=C sort -u)"
  while IFS= read -r host; do
    [[ -n "$host" ]] || continue
    rows=$((rows + 1))
    b_status="$(grep -v '^#' "$before" | awk -F'\t' -v h="$host" '$1 == h { print $2; exit }')"
    b_exp="$(grep -v '^#' "$before" | awk -F'\t' -v h="$host" '$1 == h { print $3; exit }')"
    a_status="$(grep -v '^#' "$after" | awk -F'\t' -v h="$host" '$1 == h { print $2; exit }')"
    a_exp="$(grep -v '^#' "$after" | awk -F'\t' -v h="$host" '$1 == h { print $3; exit }')"
    if [[ -z "$b_status" ]]; then
      printf '  %-48s %-14s %s\n' "$host" "(new)" "<-- FAIL: only in the after snapshot"
      failures=$((failures + 1))
    elif [[ -z "$a_status" ]]; then
      printf '  %-48s %-14s %s\n' "$host" "(gone)" "<-- FAIL: only in the before snapshot"
      failures=$((failures + 1))
    elif [[ "$b_status" != "$a_status" ]]; then
      printf '  %-48s %-14s %s\n' "$host" "${b_status} -> ${a_status}" "<-- FAIL: the HTTP status changed"
      failures=$((failures + 1))
    elif [[ "$b_exp" != "$a_exp" ]]; then
      printf '  %-48s %-14s %s\n' "$host" "${a_status} (same)" "<-- WARN: certificate expiry ${b_exp} -> ${a_exp}"
      warnings=$((warnings + 1))
    else
      printf '  %-48s %-14s %s\n' "$host" "${a_status} (same)" "${a_exp}"
    fi
  done <<<"$hosts"
  echo
  if ((failures == 0)); then
    if ((warnings > 0)); then
      echo "PASS: all ${rows} hosts answer as before (${warnings} certificate warning(s) above)."
    else
      echo "PASS: all ${rows} hosts answer as before."
    fi
    return 0
  fi
  echo "FAIL: ${failures} difference(s) (and ${warnings} certificate warning(s))."
  return 1
}

main "$@"; exit $?

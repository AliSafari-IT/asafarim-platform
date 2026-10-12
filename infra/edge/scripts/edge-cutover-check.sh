#!/usr/bin/env bash
#
# Edge cutover, step 1 (#839, #770 phase 3): a READ-ONLY check. Runs ON the VPS.
# It never changes a file, a container or a config: it reads both Caddy configs,
# adapts and validates COPIES of them in throwaway containers, and (with
# --snapshot) sends plain HTTPS requests to this host.
#
#   edge-cutover-check.sh                         the pre-cutover check
#   edge-cutover-check.sh --snapshot <file>       write a host-by-host table (HTTP status, certificate expiry)
#   edge-cutover-check.sh --compare <before> <after>   print what changed between two snapshots
#
# The check compares the live Caddy (asafarim-com's, owns 80/443 today) with the
# shared edge's combined config BY HOST NAME, not by file: the same host can be
# defined in different files. It prints one table (host × live/edge) and ends
# with a single PASS or FAIL line. FAIL means one of:
#   - a host is served by one config and not the other;
#   - a site file in the live Caddy's sites.local/ (installed there by other
#     stacks before the cutover: igs, asafarim-os) has no identical copy in the
#     edge's sites/;
#   - the edge's combined config does not validate (or a config does not adapt).
# It also prints which container publishes ports 80/443 today (information only).
#
# Exit codes: 0 PASS, 1 FAIL, 2 usage or missing input.
#
# Environment (defaults are the VPS layout):
#   CUTOVER_LIVE_DIR   the live Caddy's config dir   (/var/repos/asafarim-com/infra/caddy)
#   EDGE_DIR           the edge project              (/var/repos/edge; config in caddy/)
#   EDGE_CADDY_IMAGE   image used to adapt/validate  (caddy:2.11.4, the edge's pinned version)
#   CUTOVER_TARGET     IP the snapshot connects to   (127.0.0.1: this host, whatever DNS says)
#   CUTOVER_TIMEOUT    seconds per request           (10)
set -euo pipefail

LIVE_DIR="${CUTOVER_LIVE_DIR:-/var/repos/asafarim-com/infra/caddy}"
EDGE_DIR="${EDGE_DIR:-/var/repos/edge}"
EDGE_CONF="${EDGE_DIR}/caddy"
CADDY_IMAGE="${EDGE_CADDY_IMAGE:-caddy:2.11.4}"
TARGET="${CUTOVER_TARGET:-127.0.0.1}"
TIMEOUT="${CUTOVER_TIMEOUT:-10}"

usage() {
  sed -n '8,10p' "$0" | sed 's/^#   //' >&2
  exit 2
}

scratch="$(mktemp -d)"
trap 'rm -rf "$scratch"' EXIT

# Copy a config dir (never mount the live one) and `caddy <cmd>` it in a throwaway container.
caddy_in_copy() {
  local dir="$1" name="$2" cmd="$3"
  if [[ ! -d "${scratch}/${name}" ]]; then
    mkdir -p "${scratch}/${name}"
    cp -R "${dir}/." "${scratch}/${name}/"
  fi
  docker run --rm --network none -v "${scratch}/${name}:/etc/caddy:ro" -w /etc/caddy "$CADDY_IMAGE" \
    caddy "$cmd" --config /etc/caddy/Caddyfile --adapter caddyfile
}

# Every host name a config serves: all host matchers in its adapted JSON, one per line, sorted.
hosts_of() {
  local dir="$1" name="$2" json
  json="$(caddy_in_copy "$dir" "$name" adapt 2>"${scratch}/${name}.adapt.log")" || return 1
  { grep -o '"host":\[[^]]*\]' <<<"$json" || true; } |
    sed -e 's/^"host":\[//' -e 's/\]$//' | tr ',' '\n' | tr -d '"' | sed '/^$/d' | sort -u
}

need_dir() {
  [[ -f "${1}/Caddyfile" ]] || { echo "edge-cutover-check: no Caddyfile in $1 ($2)" >&2; exit 2; }
}

# ---------------------------------------------------------------------------
check() {
  need_dir "$LIVE_DIR" "the live Caddy; set CUTOVER_LIVE_DIR"
  need_dir "$EDGE_CONF" "the edge; set EDGE_DIR"
  local problems=0 live_hosts edge_hosts

  echo "Edge cutover check (read-only)"
  echo "  live: ${LIVE_DIR}"
  echo "  edge: ${EDGE_CONF}"
  echo "  image: ${CADDY_IMAGE}"
  echo

  # 1. Hosts, by name.
  if ! live_hosts="$(hosts_of "$LIVE_DIR" live)"; then
    echo "FAIL: the live config does not adapt:"; tail -n 10 "${scratch}/live.adapt.log"; live_hosts=""
    problems=$((problems + 1))
  fi
  if ! edge_hosts="$(hosts_of "$EDGE_CONF" edge)"; then
    echo "FAIL: the edge config does not adapt:"; tail -n 10 "${scratch}/edge.adapt.log"; edge_hosts=""
    problems=$((problems + 1))
  fi
  printf '%s\n' "$live_hosts" | sed '/^$/d' >"${scratch}/live.hosts"
  printf '%s\n' "$edge_hosts" | sed '/^$/d' >"${scratch}/edge.hosts"

  echo "== Hosts (live Caddy vs edge)"
  printf '%-34s %-5s %s\n' HOST LIVE EDGE
  local host in_live in_edge note
  while IFS= read -r host; do
    [[ -n "$host" ]] || continue
    in_live=no; in_edge=no; note=""
    grep -qxF "$host" "${scratch}/live.hosts" && in_live=yes
    grep -qxF "$host" "${scratch}/edge.hosts" && in_edge=yes
    if [[ "$in_live" == yes && "$in_edge" == no ]]; then note="MISSING ON EDGE"; problems=$((problems + 1)); fi
    if [[ "$in_live" == no && "$in_edge" == yes ]]; then note="NOT ON LIVE"; problems=$((problems + 1)); fi
    if [[ -n "$note" ]]; then
      printf '%-34s %-5s %-5s %s\n' "$host" "$in_live" "$in_edge" "$note"
    else
      printf '%-34s %-5s %s\n' "$host" "$in_live" "$in_edge"
    fi
  done < <(sort -u "${scratch}/live.hosts" "${scratch}/edge.hosts")
  echo "  $(wc -l <"${scratch}/live.hosts" | tr -d ' ') live, $(wc -l <"${scratch}/edge.hosts" | tr -d ' ') edge"
  echo

  # 2. Every site file other stacks installed into the live Caddy has an identical edge copy.
  echo "== Site files in the live sites.local/ (must be identical in the edge's sites/)"
  local f base found=false
  for f in "${LIVE_DIR}"/sites.local/*.caddy; do
    [[ -f "$f" ]] || continue
    found=true
    base="$(basename "$f")"
    if [[ ! -f "${EDGE_CONF}/sites/${base}" ]]; then
      printf '%-34s %s\n' "$base" "MISSING: no sites/${base} on the edge"
      problems=$((problems + 1))
    elif cmp -s "$f" "${EDGE_CONF}/sites/${base}"; then
      printf '%-34s %s\n' "$base" "identical"
    else
      printf '%-34s %s\n' "$base" "DIFFERS from sites/${base} on the edge"
      problems=$((problems + 1))
    fi
  done
  [[ "$found" == true ]] || echo "  (none)"
  echo

  # 3. The edge's combined config validates.
  echo "== caddy validate (edge, combined config)"
  if caddy_in_copy "$EDGE_CONF" edge validate >"${scratch}/validate.log" 2>&1; then
    echo "  valid"
  else
    echo "  INVALID:"; tail -n 10 "${scratch}/validate.log" | sed 's/^/    /'
    problems=$((problems + 1))
  fi
  echo

  # 4. Who owns 80/443 today (information only).
  echo "== Ports 80/443 today"
  local port owners
  for port in 80 443; do
    owners="$(docker ps --filter "publish=${port}" --format '{{.Names}} (project {{.Label "com.docker.compose.project"}})' 2>/dev/null | paste -sd ',' - | sed 's/,/, /g')"
    printf '  %-4s %s\n' "$port" "${owners:-no container publishes it}"
  done
  echo

  if ((problems == 0)); then
    echo "RESULT: PASS (the edge serves every host the live Caddy serves, and nothing else)"
    return 0
  fi
  echo "RESULT: FAIL (${problems} problem(s) above; fix them before the cutover)"
  return 1
}

# ---------------------------------------------------------------------------
status_of() {
  curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT" \
    --resolve "${1}:443:${TARGET}" "https://${1}/" 2>/dev/null || true
}

cert_expiry_of() {
  local end
  end="$(timeout "$TIMEOUT" openssl s_client -connect "${TARGET}:443" -servername "$1" </dev/null 2>/dev/null |
    openssl x509 -noout -enddate 2>/dev/null || true)"
  end="${end#notAfter=}"
  printf '%s' "${end:--}"
}

snapshot() {
  local out="$1" host status
  need_dir "$LIVE_DIR" "the live Caddy; set CUTOVER_LIVE_DIR"
  need_dir "$EDGE_CONF" "the edge; set EDGE_DIR"
  { hosts_of "$LIVE_DIR" live || true; hosts_of "$EDGE_CONF" edge || true; } | sort -u >"${scratch}/all.hosts"
  if [[ ! -s "${scratch}/all.hosts" ]]; then
    echo "edge-cutover-check: neither config adapts; no hosts to snapshot." >&2
    exit 1
  fi
  {
    printf '# edge-cutover snapshot %s target %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$TARGET"
    printf '# host\tstatus\tcert_not_after\n'
    while IFS= read -r host; do
      status="$(status_of "$host")"
      printf '%s\t%s\t%s\n' "$host" "${status:-000}" "$(cert_expiry_of "$host")"
    done <"${scratch}/all.hosts"
  } >"${scratch}/snapshot"
  cp "${scratch}/snapshot" "$out"
  column -t -s $'\t' <"$out" 2>/dev/null || cat "$out"
  echo "snapshot: $(grep -vc '^#' "$out") host(s) written to ${out}"
}

# A host fails when its HTTP status changed, it is in only one snapshot, or it
# had a certificate before and has none after. A different expiry alone is a note.
compare() {
  local before="$1" after="$2"
  [[ -f "$before" ]] || { echo "edge-cutover-check: no snapshot at $before" >&2; exit 2; }
  [[ -f "$after" ]] || { echo "edge-cutover-check: no snapshot at $after" >&2; exit 2; }
  awk -F'\t' '
    FNR == 1 { file++ }
    /^#/ || NF < 2 { next }
    file == 1 { bs[$1] = $2; bc[$1] = $3; hosts[$1] = 1 }
    file == 2 { as[$1] = $2; ac[$1] = $3; hosts[$1] = 1 }
    END {
      n = 0; for (h in hosts) list[++n] = h
      for (i = 2; i <= n; i++) { v = list[i]; for (j = i - 1; j > 0 && list[j] > v; j--) list[j + 1] = list[j]; list[j + 1] = v }
      printf "%-34s %-6s %-6s %s\n", "HOST", "BEFORE", "AFTER", ""
      bad = 0
      for (i = 1; i <= n; i++) {
        h = list[i]; note = "same"
        if (!(h in bs)) { note = "ONLY AFTER"; bad++ }
        else if (!(h in as)) { note = "ONLY BEFORE"; bad++ }
        else if (bs[h] != as[h]) { note = "STATUS CHANGED"; bad++ }
        else if (bc[h] != "-" && ac[h] == "-") { note = "NO CERTIFICATE AFTER"; bad++ }
        else if (bc[h] != ac[h]) { note = "same (certificate expiry " bc[h] " -> " ac[h] ")" }
        printf "%-34s %-6s %-6s %s\n", h, (h in bs ? bs[h] : "-"), (h in as ? as[h] : "-"), note
      }
      if (bad == 0) { print "RESULT: PASS (every host answers as before)"; exit 0 }
      printf "RESULT: FAIL (%d host(s) differ; consider the rollback)\n", bad
      exit 1
    }' "$before" "$after"
}

# ---------------------------------------------------------------------------
case "${1:-}" in
  "") check ;;
  --snapshot) [[ $# -eq 2 ]] || usage; snapshot "$2" ;;
  --compare) [[ $# -eq 3 ]] || usage; compare "$2" "$3" ;;
  -h | --help) usage ;;
  *) usage ;;
esac

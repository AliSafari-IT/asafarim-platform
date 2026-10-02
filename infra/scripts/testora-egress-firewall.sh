#!/usr/bin/env bash
#
# Host egress filter for Testora's isolated runner (#718, ADR 0004 §1).
#
# The runner container sits on `testora_egress`, a Docker bridge with a FIXED
# subnet (docker-compose.prod.yml). Everything it sends — Chromium, TestCafe's
# proxy, t.request, fetch, raw sockets in scripted code — is filtered here by
# SOURCE subnet, so a wrong DNS answer or app-layer policy can't reach inside:
#
#   FORWARD → DOCKER-USER → TESTORA-EGRESS      (traffic routed off the host)
#     ACCEPT  established/related
#     ACCEPT  the host's public IP on 80/443 (Docker DNATs it to Caddy): the
#             public apps, reached the way any internet client reaches them
#     ACCEPT  DNS to the host's upstream resolvers
#     DROP    any other port published on the host (e.g. MinIO 9100/9011)
#     DROP    RFC1918, loopback, link-local/metadata, CGNAT, multicast,
#             reserved and documentation ranges, and the host's own addresses
#     RETURN  the rest (the public internet) to Docker's own chains
#   INPUT → TESTORA-EGRESS-IN                   (traffic TO the host itself:
#     DROP    bridge gateways, the public IP's sshd, anything listening)
#
# Idempotent: chains are rebuilt atomically with iptables-restore and the
# jumps kept exactly once, at the top. Run by vps-deploy.sh on every deploy
# and by testora-egress-firewall.service at boot and whenever Docker restarts.
# IPv4 only: IPv6 is disabled on testora_egress (enable_ipv6: false).
#
set -euo pipefail

SUBNET="${TESTORA_EGRESS_SUBNET:-172.31.254.0/24}"
FWD_CHAIN="TESTORA-EGRESS"
IN_CHAIN="TESTORA-EGRESS-IN"

ipt() { iptables -w 10 "$@"; }

# The host's own global IPv4 addresses (not Docker bridges or veths).
mapfile -t HOST_IPS < <(
  ip -4 -o addr show scope global |
    awk '$2 !~ /^(docker|br-|veth)/ { split($4, a, "/"); print a[1] }'
)
if (( ${#HOST_IPS[@]} == 0 )); then
  echo "FATAL: could not find the host's public IPv4 address." >&2
  exit 1
fi

# Upstream resolvers Docker's embedded DNS forwards to (systemd-resolved's
# real upstreams; /etc/resolv.conf only names the 127.0.0.53 stub).
RESOLV=/run/systemd/resolve/resolv.conf
[[ -r "$RESOLV" ]] || RESOLV=/etc/resolv.conf
mapfile -t RESOLVERS < <(
  awk '$1 == "nameserver" && $2 ~ /^[0-9.]+$/ && $2 !~ /^127\./ { print $2 }' "$RESOLV"
)

BLOCKED_RANGES=(
  0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12
  192.0.0.0/24 192.0.2.0/24 192.168.0.0/16 198.18.0.0/15 198.51.100.0/24
  203.0.113.0/24 224.0.0.0/4 240.0.0.0/4
)

{
  echo "*filter"
  echo ":${FWD_CHAIN} - [0:0]"
  echo ":${IN_CHAIN} - [0:0]"
  echo "-A ${FWD_CHAIN} -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
  for ip in "${HOST_IPS[@]}"; do
    for port in 80 443; do
      echo "-A ${FWD_CHAIN} -p tcp -m conntrack --ctstate DNAT --ctorigdst ${ip} --ctorigdstport ${port} -j RETURN"
    done
  done
  for resolver in "${RESOLVERS[@]}"; do
    echo "-A ${FWD_CHAIN} -d ${resolver} -p udp --dport 53 -j RETURN"
    echo "-A ${FWD_CHAIN} -d ${resolver} -p tcp --dport 53 -j RETURN"
  done
  echo "-A ${FWD_CHAIN} -m conntrack --ctstate DNAT -j DROP"
  for range in "${BLOCKED_RANGES[@]}" "${HOST_IPS[@]}"; do
    echo "-A ${FWD_CHAIN} -d ${range} -j DROP"
  done
  echo "-A ${FWD_CHAIN} -j RETURN"
  echo "-A ${IN_CHAIN} -m conntrack --ctstate ESTABLISHED,RELATED -j RETURN"
  echo "-A ${IN_CHAIN} -j DROP"
  echo "COMMIT"
} | iptables-restore -w 10 --noflush

# Docker creates DOCKER-USER itself; make sure it exists if Docker hasn't yet.
ipt -nL DOCKER-USER >/dev/null 2>&1 || ipt -N DOCKER-USER

# Keep exactly one jump, in first position: insert the new one first, then
# delete any others from the bottom up (never a moment without the jump).
ensure_first_jump() {
  local chain="$1" target="$2"
  ipt -I "$chain" 1 -s "$SUBNET" -j "$target"
  local nums
  nums="$(ipt -L "$chain" -n --line-numbers |
    awk -v t="$target" -v s="$SUBNET" '$2 == t && $5 == s && $1 != 1 { print $1 }' | sort -rn)"
  for n in $nums; do ipt -D "$chain" "$n"; done
}
ensure_first_jump DOCKER-USER "$FWD_CHAIN"
ensure_first_jump INPUT "$IN_CHAIN"

echo "testora egress filter: ${SUBNET} — host ${HOST_IPS[*]}, resolvers ${RESOLVERS[*]:-none}"
ipt -S "$FWD_CHAIN" | sed 's/^/  /'
ipt -S "$IN_CHAIN" | sed 's/^/  /'

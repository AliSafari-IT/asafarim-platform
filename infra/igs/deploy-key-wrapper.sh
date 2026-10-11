#!/usr/bin/env bash
#
# Forced command for the igs-pharma staging deploy key (asafarim-platform#833,
# roadmap IGS-D6). The key's line in the VPS authorized_keys runs this script
# and nothing else, whatever the client asks for:
#
#   command="/var/repos/asafarim-com/infra/igs/deploy-key-wrapper.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-user-rc ssh-ed25519 AAAA… igs-staging-deploy
#
# The client's command (`ssh … <sha>`) reaches it as SSH_ORIGINAL_COMMAND. It
# accepts exactly one thing: a full 40-character lowercase hex commit SHA. Then
# it runs `infra/scripts/igs-deploy.sh <sha>` (one deploy at a time) and exits
# with its status. Anything else (a short SHA, spaces, `;`, a newline, nothing)
# is refused before any command runs. It can also be run by hand with the SHA as
# its one argument.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY="${IGS_DEPLOY_SCRIPT:-${HERE}/../scripts/igs-deploy.sh}"
LOCK="${IGS_DEPLOY_LOCK:-/run/lock/igs-deploy.lock}"

refuse() {
  echo "igs-deploy-key: refused: $1. Send exactly one full 40-character lowercase hex commit SHA." >&2
  exit 2
}

if (($# > 1)); then refuse "more than one argument"; fi
if (($# == 1)); then sha="$1"; else sha="${SSH_ORIGINAL_COMMAND-}"; fi
[[ -n "$sha" ]] || refuse "no SHA"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || refuse "not a full commit SHA"

exec 9>"$LOCK"
flock -n 9 || { echo "igs-deploy-key: another igs deploy is running; try again when it ends." >&2; exit 75; }
echo "igs-deploy-key: deploying ${sha}"
"$DEPLOY" "$sha"

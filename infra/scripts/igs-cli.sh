#!/usr/bin/env bash
#
# Run an igs-pharma operator CLI on igs staging (#841). Runs ON the VPS, by Ali,
# from the asafarim-com checkout:
#
#   infra/scripts/igs-cli.sh bootstrap-owner --email <address> [--reissue]
#   IGS_ALLOW_SYNTHETIC_SEED=1 infra/scripts/igs-cli.sh seed-catalog
#
# These CLIs need the owner's database connection (DATABASE_MIGRATE_URL,
# igs-pharma#75), which the long-running igs-worker never has. So they run in a
# throwaway igs-migrate container, on the image igs-worker runs now, and never
# with `docker exec` in the worker. Anything after the command name is passed on.
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
LIB="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib"
# shellcheck source=lib/igs.sh
source "${LIB}/igs.sh"

cmd="${1:-}"
case "$cmd" in
  bootstrap-owner | seed-catalog) shift ;;
  *)
    echo "usage: $0 bootstrap-owner|seed-catalog [args...]" >&2
    exit 2
    ;;
esac

cd "$REPO_DIR"
STACK_DIR="infra/igs"
ENV_FILE="${STACK_DIR}/.env.igs"
[[ -f .age/key.txt ]] || { echo "FATAL: .age/key.txt missing on the server." >&2; exit 1; }
(umask 077 && age -d -i .age/key.txt "${ENV_FILE}.age" >"$ENV_FILE")

IGS_IMAGE_TAG="$(igs_running_tag)"
export IGS_IMAGE_TAG

extra=()
# The synthetic seed refuses to run without this; pass it on only when set here.
if [[ "${IGS_ALLOW_SYNTHETIC_SEED:-}" == 1 ]]; then extra+=(-e IGS_ALLOW_SYNTHETIC_SEED=1); fi

exec docker compose -p igs -f "${STACK_DIR}/docker-compose.yml" --env-file "$ENV_FILE" \
  run --rm --no-deps -T "${extra[@]}" igs-migrate node "dist/${cmd}.js" "$@"

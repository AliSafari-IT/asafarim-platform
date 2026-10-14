#!/usr/bin/env bash
#
# Create the igs-pharma database logins on igs.asafarim staging (#841, igs-pharma#66/#75).
# Runs ON the VPS, by Ali, from the asafarim-com checkout, ONCE, after
# `infra/scripts/igs-deploy.sh --migrate-only <sha>` (which creates the igs_app and
# igs_worker groups the logins join):
#
#   infra/scripts/igs-db-roles.sh
#
# It runs infra/igs/create-login-roles.sql (a pinned copy of igs-pharma's) inside
# igs-postgres as the owner `igs`, over the container's local socket: it creates
# igs_app_login (web, platform) and igs_worker_login (the worker), each with only its
# group's rights and CONNECT. Running it again changes nothing.
#
# It never takes, sets or prints a password. Set each one once, interactively, so it
# never touches a file or a shell history (the same values as in .env.igs):
#
#   docker exec -it igs-igs-postgres-1 psql -U igs -d igs -c '\password igs_app_login'
#   docker exec -it igs-igs-postgres-1 psql -U igs -d igs -c '\password igs_worker_login'
set -euo pipefail

REPO_DIR="${REPO_DIR:-/var/repos/asafarim-com}"
cd "$REPO_DIR"
SQL="infra/igs/create-login-roles.sql"
APP_LOGIN=igs_app_login
WORKER_LOGIN=igs_worker_login

pg="$(docker compose -p igs ps -q igs-postgres 2>/dev/null | head -n 1)"
if [[ -z "$pg" ]]; then
  echo "FATAL: igs-postgres is not running. First: infra/scripts/igs-deploy.sh --migrate-only <sha>" >&2
  exit 1
fi
psql_owner() { docker exec -i "$pg" psql -X -q -U igs -d igs -v ON_ERROR_STOP=1 "$@"; }

groups="$(psql_owner -tA -c "SELECT count(*) FROM pg_roles WHERE rolname IN ('igs_app', 'igs_worker')")"
if [[ "$groups" != 2 ]]; then
  echo "FATAL: the igs_app / igs_worker groups don't exist yet (igs-pharma migration 0026). First: infra/scripts/igs-deploy.sh --migrate-only <sha>" >&2
  exit 1
fi

psql_owner -v app_login="$APP_LOGIN" -v worker_login="$WORKER_LOGIN" <"$SQL"

echo "Logins ready: ${APP_LOGIN} (igs-web, igs-platform), ${WORKER_LOGIN} (igs-worker)."
echo "Next, if not done yet: set each password (the values in .env.igs), then deploy:"
echo "  docker exec -it ${pg:0:12} psql -U igs -d igs -c '\\password ${APP_LOGIN}'"
echo "  docker exec -it ${pg:0:12} psql -U igs -d igs -c '\\password ${WORKER_LOGIN}'"
echo "  infra/scripts/igs-deploy.sh <sha>"

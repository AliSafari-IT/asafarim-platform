#!/usr/bin/env bash
#
# igs-pharma.be staging: restore drill (asafarim-platform#829, roadmap IGS-D7).
# Run by hand by Ali. It proves the newest backup can be read and restored:
#
#   1. download the newest igs/…/igs-<stamp>.dump.age (or the one given with --key);
#   2. decrypt it with Ali's age key, which never touches this server's disk;
#   3. restore it into a throwaway postgres:16-alpine container on its own network
#      (no ports, removed at the end, even on failure);
#   4. run sanity queries (tables, row counts, migrations) and print the timings.
#
# Usage, from the asafarim-com checkout on the VPS (the S3 settings come from the
# decrypted igs env, infra/igs/.env.igs), with the key streamed over SSH:
#
#   ssh <vps> 'cd /var/repos/asafarim-com && infra/scripts/igs-restore-drill.sh -i -' < ~/igs-backup.key
#
# or on any machine with Docker and age, with a copy of the igs env:
#
#   infra/scripts/igs-restore-drill.sh -i ~/igs-backup.key --env <path-to-.env.igs>
#
#   -i <file>|-   the age identity (private key); "-" reads it from stdin into memory
#   --env <file>  the igs env with the IGS_BACKUP_S3_* keys (default: infra/igs/.env.igs)
#   --key <key>   restore this object instead of the newest
set -euo pipefail

DRILL_IMAGE="${IGS_DRILL_IMAGE:-postgres:16-alpine}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=igs-backup.sh
source "${here}/igs-backup.sh"
log() { echo "[igs-restore-drill] $*"; }
die() { echo "[igs-restore-drill] FAILED: $*" >&2; exit 1; }

identity="" env_file="${REPO_DIR:-.}/infra/igs/.env.igs" key=""
while (($#)); do
  case "$1" in
    -i) identity="${2:-}"; shift 2 ;;
    --env) env_file="${2:-}"; shift 2 ;;
    --key) key="${2:-}"; shift 2 ;;
    -h | --help) sed -n '2,/^set -euo/p' "$0" | sed '$d; s/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown argument: $1 (see --help)" ;;
  esac
done
[[ -n "$identity" ]] || die "give the age key with -i <file>, or -i - to read it from stdin"
[[ -r "$env_file" ]] || die "${env_file} not found (give the igs env with --env)"
unset_keys="$(igs_backup_unset_keys "$env_file" | grep -v '^IGS_BACKUP_AGE_RECIPIENT$' || true)"
[[ -z "$unset_keys" ]] || die "S3 keys not set in ${env_file}: ${unset_keys//$'\n'/ }"

# The key stays in memory: age reads it through a pipe, never from a file we write.
if [[ "$identity" == - ]]; then
  key_material="$(cat)"
  [[ "$key_material" == *AGE-SECRET-KEY-* ]] || die "stdin does not hold an age identity"
else
  [[ -r "$identity" ]] || die "cannot read ${identity}"
  key_material="$(<"$identity")"
fi

igs_s3_setup "$env_file"
suffix="$(od -An -N4 -tx1 /dev/urandom | tr -d ' \n')"
name="igs-restore-drill-${suffix}"
net="igs-restore-drill-${suffix}"
cleanup() {
  docker rm -f "$name" >/dev/null 2>&1 || true
  docker network rm "$net" >/dev/null 2>&1 || true
  rm -rf "$IGS_S3_CONFIG_DIR"
}
trap cleanup EXIT

t0="$(date +%s)"
if [[ -z "$key" ]]; then
  key="$(igs_s3_list | { grep -E "$IGS_BACKUP_KEY_RE" || true; } | LC_ALL=C sort | tail -n 1)"
  [[ -n "$key" ]] || die "no backup found under s3://${IGS_S3_BUCKET}/igs/"
fi
log "restoring s3://${IGS_S3_BUCKET}/${key}"

docker network create --internal "$net" >/dev/null
docker run -d --name "$name" --network "$net" \
  -e POSTGRES_USER=igs -e POSTGRES_DB=igs -e "POSTGRES_PASSWORD=drill-${suffix}" \
  "$DRILL_IMAGE" >/dev/null
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -h 127.0.0.1 -U igs -d igs >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" pg_isready -h 127.0.0.1 -U igs -d igs >/dev/null 2>&1 || die "the throwaway Postgres did not start"
t1="$(date +%s)"

set +e
igs_s3 s3 cp "s3://${IGS_S3_BUCKET}/${key}" - |
  age -d -i <(printf '%s\n' "$key_material") |
  docker exec -i "$name" pg_restore -U igs -d igs --no-owner --no-acl --exit-on-error
status=("${PIPESTATUS[@]}")
set -e
[[ "${status[*]}" == "0 0 0" ]] ||
  die "download ${status[0]}, decrypt ${status[1]}, pg_restore ${status[2]} (non-zero means that step failed)"
t2="$(date +%s)"

psql() { docker exec "$name" psql -U igs -d igs -v ON_ERROR_STOP=1 -tA "$@"; }
tables="$(psql -c "SELECT count(*) FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')")"
((tables > 0)) || die "the restored database has no tables"
log "restored ${tables} tables. Row counts:"
psql -F $'\t' -c "SELECT table_schema || '.' || table_name,
    (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text
  FROM information_schema.tables
  WHERE table_type = 'BASE TABLE' AND table_schema NOT IN ('pg_catalog', 'information_schema')
  ORDER BY 1" | sed 's/^/  /'
migrations="$(psql -c "SELECT CASE WHEN to_regclass('drizzle.__drizzle_migrations') IS NULL THEN 'none'
  ELSE (SELECT count(*)::text FROM drizzle.__drizzle_migrations) END")"
log "applied Drizzle migrations in the backup: ${migrations}"
log "timing: download + decrypt + restore $((t2 - t1))s, total $((t2 - t0))s (including the throwaway Postgres start)"
log "OK: the drill passed; the throwaway container and network are removed."

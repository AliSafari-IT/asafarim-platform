#!/usr/bin/env bash
#
# igs-pharma.be staging: nightly encrypted Postgres backup (asafarim-platform#829,
# roadmap IGS-D7). Runs ON the VPS from igs-backup.timer (02:30 Europe/Brussels),
# which igs-deploy.sh installs when the backup keys are set.
#
#   pg_dump -Fc (inside igs-postgres) | age -r <recipient> | S3 upload
#
# - Plaintext never touches the disk: the dump is encrypted to the age public key
#   in IGS_BACKUP_AGE_RECIPIENT on its way out. The private key stays offline with
#   Ali; this server can write backups but can't read them.
# - Object key: igs/YYYY/MM/igs-<YYYYmmddTHHMMSSZ>.dump.age, in IGS_BACKUP_S3_BUCKET.
# - The upload is checked: the object's size must equal the bytes sent. A failed
#   dump or upload deletes the partial object.
# - Retention, after a verified upload only: the last 14 days, plus the first dump
#   of each of the last 6 months. Keys that don't follow the naming are never touched.
# - A failure posts to Discord (IGS_ALERT_WEBHOOK_DISCORD, #828); success is quiet.
# - The S3 client is a pinned image run with --rm (nothing installed on the host),
#   path-style addressing (works on Spaces, OVHcloud and Leafcloud), credentials
#   passed by environment name, never on a command line.
#
#   igs-backup            run a backup
#   igs-backup --check    exit 0 if the backup keys are set, 3 if not (names only)
#
# Sourcing this file only defines the functions (tests: infra/igs/igs-backup.test.mjs).
set -euo pipefail

IGS_S3_IMAGE="${IGS_S3_IMAGE:-amazon/aws-cli:2.27.50}"
IGS_BACKUP_KEYS=(IGS_BACKUP_S3_ENDPOINT IGS_BACKUP_S3_REGION IGS_BACKUP_S3_BUCKET
  IGS_BACKUP_S3_ACCESS_KEY IGS_BACKUP_S3_SECRET_KEY IGS_BACKUP_AGE_RECIPIENT)
IGS_BACKUP_KEY_RE='^igs/[0-9]{4}/[0-9]{2}/igs-[0-9]{8}T[0-9]{6}Z\.dump\.age$'

# The health check's helpers (igs_container, igs_alert_webhook, igs_notify): next to
# this script in the repo (igs-healthcheck.sh) or installed (igs-healthcheck).
_igs_backup_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${_igs_backup_dir}/igs-healthcheck.sh" ]]; then
  # shellcheck source=igs-healthcheck.sh
  source "${_igs_backup_dir}/igs-healthcheck.sh"
else
  # shellcheck source=/dev/null
  source "${_igs_backup_dir}/igs-healthcheck"
fi

log() { echo "[igs-backup] $*"; }

# One KEY=value from a dotenv file, with one pair of surrounding quotes stripped.
igs_backup_value() { # <env-file> <key>
  local line value
  line="$(grep -E "^$2=" "$1" 2>/dev/null | tail -n 1)" || return 1
  value="${line#*=}"
  if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then value="${BASH_REMATCH[1]}"; fi
  printf '%s' "$value"
}

# Prints the names of the backup keys that are missing, placeholders or invalid.
igs_backup_unset_keys() { # <env-file>
  local key value
  for key in "${IGS_BACKUP_KEYS[@]}"; do
    value="$(igs_backup_value "$1" "$key" || true)"
    if [[ -z "$value" || "$value" == *CHANGE_ME* ]]; then
      echo "$key"
    elif [[ "$key" == IGS_BACKUP_S3_ENDPOINT && ! "$value" =~ ^https?://[^[:space:]]+$ ]]; then
      echo "$key"
    elif [[ "$key" == IGS_BACKUP_AGE_RECIPIENT && ! "$value" =~ ^age1[0-9a-z]{58}$ ]]; then
      echo "$key"
    fi
  done
}

# igs/YYYY/MM/igs-<stamp>.dump.age for a UTC stamp YYYYmmddTHHMMSSZ.
igs_backup_object_key() { # <stamp>
  printf 'igs/%s/%s/igs-%s.dump.age' "${1:0:4}" "${1:4:2}" "$1"
}

# Reads object keys on stdin; prints the backups retention deletes on <today>:
# everything except the last 14 days (today included) and the first dump of each
# of the last 6 months (this month included). Other keys are ignored, never printed.
igs_backup_expired() { # <today YYYY-MM-DD>
  local day_cut month_cut
  day_cut="$(date -u -d "$1 -13 days" +%Y%m%d)"
  month_cut="$(date -u -d "${1:0:7}-01 -5 months" +%Y%m)"
  { grep -E "$IGS_BACKUP_KEY_RE" || true; } | LC_ALL=C sort -u |
    awk -v d="$day_cut" -v m="$month_cut" '{
      s = $0; sub(/.*\/igs-/, "", s)
      day = substr(s, 1, 8) ""; mon = substr(s, 1, 6) ""
      first = !(mon in seen); seen[mon] = 1
      if (day >= d "") next
      if (first && mon >= m "") next
      print
    }'
}

# The S3 client: `aws` from the pinned image, endpoint and path-style from the env.
# Needs IGS_S3_ENDPOINT, IGS_S3_REGION, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY
# in the environment, and IGS_S3_CONFIG_DIR (written by igs_s3_setup).
igs_s3() {
  docker run --rm -i \
    -e AWS_ACCESS_KEY_ID -e AWS_SECRET_ACCESS_KEY \
    -e "AWS_DEFAULT_REGION=${IGS_S3_REGION}" -e AWS_CONFIG_FILE=/igs-s3/config \
    -v "${IGS_S3_CONFIG_DIR}:/igs-s3:ro" \
    "$IGS_S3_IMAGE" --endpoint-url "$IGS_S3_ENDPOINT" "$@"
}

# Loads the S3 settings from the env file and writes the client config: path-style
# addressing, and checksums only where required (S3-compatible stores reject the
# newer default ones). Sets IGS_S3_BUCKET.
igs_s3_setup() { # <env-file>
  IGS_S3_ENDPOINT="$(igs_backup_value "$1" IGS_BACKUP_S3_ENDPOINT)"
  IGS_S3_REGION="$(igs_backup_value "$1" IGS_BACKUP_S3_REGION)"
  IGS_S3_BUCKET="$(igs_backup_value "$1" IGS_BACKUP_S3_BUCKET)"
  AWS_ACCESS_KEY_ID="$(igs_backup_value "$1" IGS_BACKUP_S3_ACCESS_KEY)"
  AWS_SECRET_ACCESS_KEY="$(igs_backup_value "$1" IGS_BACKUP_S3_SECRET_KEY)"
  export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
  IGS_S3_CONFIG_DIR="$(mktemp -d)"
  chmod 755 "$IGS_S3_CONFIG_DIR"
  cat >"${IGS_S3_CONFIG_DIR}/config" <<'EOF'
[default]
s3 =
  addressing_style = path
request_checksum_calculation = when_required
response_checksum_validation = when_required
EOF
  chmod 644 "${IGS_S3_CONFIG_DIR}/config"
}

# Every object key under igs/, one per line.
igs_s3_list() {
  igs_s3 s3api list-objects-v2 --bucket "$IGS_S3_BUCKET" --prefix igs/ \
    --query 'Contents[].Key' --output text | tr '\t' '\n' | { grep -v '^None$' || true; }
}

# Logs, alerts to Discord (if a webhook is set) and exits 1.
igs_backup_fail() { # <message>
  local webhook
  log "FAILED: $1"
  webhook="$(igs_alert_webhook "${IGS_BACKUP_ENV_FILE}")"
  if [[ -n "$webhook" ]]; then
    igs_notify "$webhook" "🔴 igs-pharma.be staging backup failed: $1" ||
      log "could not post the failure to Discord"
  else
    log "no IGS_ALERT_WEBHOOK_DISCORD set; not alerting"
  fi
  exit 1
}

igs_backup_main() {
  local repo_dir="${REPO_DIR:-/var/repos/asafarim-com}"
  IGS_BACKUP_ENV_FILE="${IGS_BACKUP_ENV_FILE:-${repo_dir}/infra/igs/.env.igs}"
  local unset_keys pg stamp key work sent size start secs status expired
  [[ -r "$IGS_BACKUP_ENV_FILE" ]] || igs_backup_fail "${IGS_BACKUP_ENV_FILE} is missing (run igs-deploy.sh)"

  unset_keys="$(igs_backup_unset_keys "$IGS_BACKUP_ENV_FILE")"
  if [[ "${1:-}" == --check ]]; then
    [[ -z "$unset_keys" ]] && return 0
    echo "igs backup keys not set: ${unset_keys//$'\n'/ }" >&2
    return 3
  fi
  [[ -z "$unset_keys" ]] || igs_backup_fail "backup keys not set in the igs env: ${unset_keys//$'\n'/ }"

  pg="$(igs_container igs-postgres)" || true
  [[ -n "$pg" ]] || igs_backup_fail "igs-postgres is not running"

  igs_s3_setup "$IGS_BACKUP_ENV_FILE"
  work="$(mktemp -d)"
  # shellcheck disable=SC2064 # expand now: the paths are fixed for this run
  trap "rm -rf '$work' '$IGS_S3_CONFIG_DIR'" EXIT
  # Never reuse an existing key: a failed run deletes its own object, and must not
  # delete (or overwrite) a good backup that a run in the same second wrote.
  for _ in 1 2 3 4 5; do
    stamp="$(date -u +%Y%m%dT%H%M%SZ)"
    key="$(igs_backup_object_key "$stamp")"
    igs_s3 s3api head-object --bucket "$IGS_S3_BUCKET" --key "$key" >/dev/null 2>&1 || break
    key=""
    sleep 1
  done
  [[ -n "$key" ]] || igs_backup_fail "could not pick an unused object key"
  start="$(date +%s)"
  log "dumping igs-postgres to s3://${IGS_S3_BUCKET}/${key} (encrypted)..."

  # Count the encrypted bytes on their way to the upload, never the plaintext.
  set +e
  docker exec "$pg" pg_dump -Fc -U igs -d igs |
    age -r "$(igs_backup_value "$IGS_BACKUP_ENV_FILE" IGS_BACKUP_AGE_RECIPIENT)" |
    tee >(wc -c >"${work}/sent") |
    igs_s3 s3 cp - "s3://${IGS_S3_BUCKET}/${key}" --only-show-errors
  status=("${PIPESTATUS[@]}")
  set -e
  for _ in $(seq 1 100); do [[ -s "${work}/sent" ]] && break; sleep 0.1; done
  sent="$(tr -d '[:space:]' <"${work}/sent" 2>/dev/null || true)"

  if [[ "${status[*]}" != "0 0 0 0" ]]; then
    igs_s3 s3 rm "s3://${IGS_S3_BUCKET}/${key}" --only-show-errors >/dev/null 2>&1 || true
    igs_backup_fail "dump or upload failed (pg_dump ${status[0]}, age ${status[1]}, upload ${status[3]}); the partial object was deleted"
  fi
  size="$(igs_s3 s3api head-object --bucket "$IGS_S3_BUCKET" --key "$key" \
    --query ContentLength --output text 2>/dev/null | tr -d '[:space:]')" || true
  if [[ -z "$sent" || "$sent" == 0 || "$size" != "$sent" ]]; then
    igs_s3 s3 rm "s3://${IGS_S3_BUCKET}/${key}" --only-show-errors >/dev/null 2>&1 || true
    igs_backup_fail "upload not verified: sent ${sent:-?} bytes, the bucket has ${size:-nothing}; the object was deleted"
  fi
  secs=$(($(date +%s) - start))
  log "uploaded ${key}: ${size} bytes in ${secs}s"

  expired="$(igs_s3_list | igs_backup_expired "$(date -u +%Y-%m-%d)")" ||
    igs_backup_fail "the backup ${key} is safe, but listing the bucket for retention failed"
  while IFS= read -r old; do
    [[ -n "$old" ]] || continue
    igs_s3 s3 rm "s3://${IGS_S3_BUCKET}/${old}" --only-show-errors ||
      igs_backup_fail "the backup ${key} is safe, but deleting the expired ${old} failed"
    log "retention: deleted ${old}"
  done <<<"$expired"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  igs_backup_main "$@"
fi

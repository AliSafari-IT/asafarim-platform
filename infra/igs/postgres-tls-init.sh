#!/bin/sh
# igs-postgres's TLS certificate (#826). Runs once before igs-postgres, in the
# one-shot igs-postgres-tls service (postgres:16, which ships openssl; the
# alpine image Postgres runs on doesn't), with no network.
#
# The igs-pharma apps always connect with TLS (`ssl: "require"`, certificate
# not verified yet: B-08), so igs-postgres needs a key pair. On the first run
# this creates a self-signed one (CN igs-postgres, 10 years) in the
# igs_postgres_tls volume; every later run keeps it unless the pair is broken
# or mismatched. Either way it (re)sets what Postgres requires: the key owned
# by Postgres's user and not readable by anyone else.
set -eu

DIR="${TLS_DIR:-/tls}"
# The postgres user of postgres:16-alpine, which runs igs-postgres (not this image's 999).
OWNER="${TLS_OWNER:-70:70}"
CRT="${DIR}/server.crt"
KEY="${DIR}/server.key"

# A pair that parses and belongs together (an interrupted first run can leave
# a new key next to an old or missing certificate: regenerate then).
pair_ok() {
  [ -s "$CRT" ] && [ -s "$KEY" ] || return 1
  crt_pub="$(openssl x509 -in "$CRT" -noout -pubkey 2>/dev/null)" || return 1
  key_pub="$(openssl pkey -in "$KEY" -pubout 2>/dev/null)" || return 1
  [ -n "$crt_pub" ] && [ "$crt_pub" = "$key_pub" ]
}

if pair_ok; then
  echo "igs-postgres-tls: keeping the existing certificate ($(openssl x509 -in "$CRT" -noout -enddate))"
else
  umask 077
  rm -f "${CRT}.new" "${KEY}.new"
  openssl req -x509 -nodes -newkey rsa:2048 -sha256 -days 3650 \
    -subj "/CN=igs-postgres" -addext "subjectAltName=DNS:igs-postgres" \
    -keyout "${KEY}.new" -out "${CRT}.new" 2>/dev/null
  mv -f "${KEY}.new" "$KEY"
  mv -f "${CRT}.new" "$CRT"
  echo "igs-postgres-tls: created a self-signed certificate ($(openssl x509 -in "$CRT" -noout -enddate))"
fi

chown "$OWNER" "$CRT" "$KEY"
chmod 0600 "$KEY"
chmod 0644 "$CRT"

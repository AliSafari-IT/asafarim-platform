#!/bin/sh
# igs-postgres's TLS certificate (#826). Runs once before igs-postgres, in the
# one-shot igs-postgres-tls service (postgres:16, which ships openssl; the
# alpine image Postgres runs on doesn't), with no network.
#
# The igs-pharma apps always connect with TLS (`ssl: "require"`, certificate
# not verified yet: B-08), so igs-postgres needs a key pair. On the first run
# this creates a self-signed one (CN igs-postgres, 10 years) in the
# igs_postgres_tls volume; every later run keeps it. Either way it (re)sets
# what Postgres requires: the key owned by Postgres's user and not readable by
# anyone else.
set -eu

DIR="${TLS_DIR:-/tls}"
# The postgres user of postgres:16-alpine, which runs igs-postgres (not this image's 999).
OWNER="${TLS_OWNER:-70:70}"
CRT="${DIR}/server.crt"
KEY="${DIR}/server.key"

if [ -s "$CRT" ] && [ -s "$KEY" ]; then
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

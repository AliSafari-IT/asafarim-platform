#!/bin/sh
# igs-postgres's TLS certificate (#826). Runs once before igs-postgres, in the
# one-shot igs-postgres-tls service (postgres:16, which ships openssl; the
# alpine image Postgres runs on doesn't), with no network.
#
# The igs-pharma apps always connect with TLS and verify the certificate and
# its host name (igs-pharma#78), so igs-postgres needs a key pair. On the first run
# this creates a self-signed one (CN igs-postgres, 10 years) in the
# igs_postgres_tls volume; every later run keeps it unless the pair is broken
# or mismatched. Either way it (re)sets what Postgres requires: the key owned
# by Postgres's user and not readable by anyone else.
#
# It then copies ONLY the public certificate to the igs_postgres_ca volume
# (ca.crt, read-only for everyone, #841): the apps mount that one to verify
# the server, and never the volume that holds the key.
set -eu

DIR="${TLS_DIR:-/tls}"
# The postgres user of postgres:16-alpine, which runs igs-postgres (not this image's 999).
OWNER="${TLS_OWNER:-70:70}"
CRT="${DIR}/server.crt"
KEY="${DIR}/server.key"
CA_DIR="${CA_DIR:-/ca}"

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

# The public certificate for the apps (#841): replaced atomically, never the key.
rm -f "${CA_DIR}/ca.crt.new"
cp "$CRT" "${CA_DIR}/ca.crt.new"
chmod 0444 "${CA_DIR}/ca.crt.new"
mv -f "${CA_DIR}/ca.crt.new" "${CA_DIR}/ca.crt"
echo "igs-postgres-tls: published the public certificate as ca.crt"

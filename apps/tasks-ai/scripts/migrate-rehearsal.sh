#!/usr/bin/env bash
# Migration + rollback rehearsal for TasksAI (M01).
#
# Proves, against a throwaway database, that:
#   1. `prisma migrate deploy` applies every migration to an empty DB, and
#   2. the documented down path leaves the DB clean.
#
# Usage:
#   TASKSAI_REHEARSAL_DATABASE_URL=postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai_rehearsal \
#     bash scripts/migrate-rehearsal.sh
set -euo pipefail

URL="${TASKSAI_REHEARSAL_DATABASE_URL:?set TASKSAI_REHEARSAL_DATABASE_URL to a throwaway database}"

if [[ "${URL}" == "${TASKSAI_DATABASE_URL:-}" || "${URL}" == "${DATABASE_URL:-}" ]]; then
  echo "refusing to rehearse against the dev or platform database" >&2
  exit 1
fi

echo "==> apply all migrations to an empty database"
TASKSAI_DATABASE_URL="${URL}" pnpm exec prisma migrate deploy --schema prisma/schema.prisma

echo "==> verify schema matches migrations (no drift)"
TASKSAI_DATABASE_URL="${URL}" pnpm exec prisma migrate diff \
  --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code

echo "==> rollback: drop the M01 baseline table"
TASKSAI_DATABASE_URL="${URL}" pnpm exec prisma db execute --stdin <<'SQL'
DROP TABLE IF EXISTS "health_probe";
DELETE FROM "_prisma_migrations";
SQL

echo "==> re-apply from empty to prove idempotent recovery"
TASKSAI_DATABASE_URL="${URL}" pnpm exec prisma migrate deploy --schema prisma/schema.prisma

echo "OK: migrate + rollback + re-apply rehearsal passed"

import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString =
  process.env.APPBUILDER_DATABASE_URL ??
  "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder";

const TABLE_NAMES = [
  "idempotency_keys",
  "audit_events",
  "deployments",
  "releases",
  "preview_builds",
  "generation_operation_batches",
  "generation_jobs",
  "applied_operations",
  "specification_versions",
  "specifications",
  "creation_requests",
  "collaborators",
  "apps",
] as const;

let pool: Pool | undefined;

export function getTestDb() {
  if (!pool) pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

export async function migrateTestDb(): Promise<void> {
  const db = drizzle(getTestPool());
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
}

/** Truncates every app-owned table between tests so fixtures don't leak across cases. */
export async function resetTestDb(): Promise<void> {
  const db = getTestDb();
  await db.execute(sql.raw(`truncate table ${TABLE_NAMES.join(", ")} restart identity cascade`));
}

export async function closeTestDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

function getTestPool(): Pool {
  if (!pool) pool = new Pool({ connectionString });
  return pool;
}

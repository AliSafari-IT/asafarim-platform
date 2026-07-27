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
  // M11
  "deployment_steps",
  "deployments",
  "app_domains",
  "releases",
  "preview_builds",
  "modification_operation_batches",
  "modification_jobs",
  "conversation_messages",
  "conversations",
  "generation_operation_batches",
  "generation_jobs",
  "applied_operations",
  "specification_versions",
  "specifications",
  "creation_requests",
  "collaborators",
  // M09 generated-data engine — previously missing here, which would have
  // let a seeded generated-app row leak across test files.
  "generated_workflow_step_executions",
  "generated_workflow_executions",
  "generated_notifications",
  "generated_activity",
  "generated_files",
  "generated_record_relations",
  "generated_uniqueness_claims",
  "generated_record_revisions",
  "generated_records",
  "generated_row_access_rules",
  "generated_data_idempotency",
  "generated_app_members",
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

import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// AppBuilder keeps its own database, isolated from the platform's shared
// Prisma Postgres. Use APPBUILDER_DATABASE_URL so this never accidentally
// picks up the root DATABASE_URL (see docs/appbuilder-architecture.md).
const connectionString =
  process.env.APPBUILDER_DATABASE_URL ??
  "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder";

let pool: Pool | undefined;
let db: NodePgDatabase<typeof schema> | undefined;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({ connectionString });
  }
  return pool;
}

export function getDb(): NodePgDatabase<typeof schema> {
  if (!db) {
    db = drizzle(getPool(), { schema });
  }
  return db;
}

/** Closes the pool. Used by scripts and test teardown — never called from request handlers. */
export async function closeDb(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
    db = undefined;
  }
}

export type Db = NodePgDatabase<typeof schema>;
export { schema };

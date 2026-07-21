import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const connectionString =
  process.env.APPBUILDER_DATABASE_URL ??
  "postgres://appbuilder:appbuilder_dev@localhost:55436/appbuilder";

// Idempotent: drizzle records applied migrations in a journal table
// (`drizzle.__drizzle_migrations`), so rerunning against an already-migrated
// database is a safe no-op.
async function main() {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder: "./lib/db/migrations" });
  await pool.end();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

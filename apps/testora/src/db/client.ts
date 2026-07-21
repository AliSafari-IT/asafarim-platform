import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// testora keeps its own database, separate from the platform's shared Prisma
// Postgres. Use TESTORA_DATABASE_URL so it never accidentally picks up the
// root DATABASE_URL.
const connectionString =
  process.env.TESTORA_DATABASE_URL ?? "postgres://e2e_testora:e2e_testora@localhost:55434/e2e-testing-db";

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });

import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../env";
import { PrismaClient } from "./generated";

/**
 * Singleton Prisma client for the dedicated TasksAI database. A different
 * schema, database, and connection pool from `@asafarim/db`'s platform
 * client. Importing both in one process is safe precisely because this one
 * is generated into `lib/db/generated` rather than `@prisma/client`.
 *
 * Deliberately no `import "server-only"` here, unlike most of this app's
 * `lib/`: this module is imported directly by `worker/` (a plain Node/tsx
 * process, never bundled by Next.js), and `server-only`'s package resolution
 * fails outside Next.js's build — it crash-looped the worker in production
 * with ERR_MODULE_NOT_FOUND (issue #363). Client-side exposure is already
 * prevented by this only ever being reachable from Route Handlers/Server
 * Components/the worker, none of which ship to the browser.
 */

const globalForPrisma = globalThis as unknown as {
  tasksAiPrisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().databaseUrl });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

/** Create the client only when a request or worker actually needs it. */
export function getTasksAiDb(): PrismaClient {
  globalForPrisma.tasksAiPrisma ??= createClient();
  return globalForPrisma.tasksAiPrisma;
}

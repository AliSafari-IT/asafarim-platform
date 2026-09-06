import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../env";
import { PrismaClient } from "./generated";

/**
 * Singleton Prisma client for the dedicated TasksAI database. A different
 * schema, database, and connection pool from `@asafarim/db`'s platform
 * client. Importing both in one process is safe precisely because this one
 * is generated into `lib/db/generated` rather than `@prisma/client`.
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

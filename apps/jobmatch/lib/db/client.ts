import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { getEnv } from "../env";
import { PrismaClient } from "./generated";

/**
 * JobMatch's own Prisma client — a different schema, a different database,
 * and a different connection pool from `@asafarim/db`'s platform client.
 * Importing both in one process is expected and safe precisely because this
 * one is generated into `lib/db/generated` rather than `@prisma/client`.
 */

const globalForPrisma = globalThis as unknown as {
  jobmatchPrisma: PrismaClient | undefined;
};

function createClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: getEnv().databaseUrl });
  return new PrismaClient({
    adapter,
    // Query logging is off even in development: JobMatch queries carry CV
    // and candidate-profile parameters from M2 onward, and a log setting
    // that has to be remembered at that point is one that gets forgotten.
    log: ["error"],
  });
}

/** Create the client only when a request or worker actually needs the database. */
export function getJobmatchDb(): PrismaClient {
  globalForPrisma.jobmatchPrisma ??= createClient();
  return globalForPrisma.jobmatchPrisma;
}

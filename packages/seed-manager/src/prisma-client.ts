// A short-lived Prisma client bound to an explicitly resolved connection
// string. Providers create one per operation and always dispose it, so a
// staging inspection never leaves a pool open against production.

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

export type SeedPrismaClient = PrismaClient;

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

/** Run `fn` with a client that is disconnected no matter how `fn` ends. */
export async function withPrisma<T>(
  connectionString: string,
  fn: (prisma: PrismaClient) => Promise<T>
): Promise<T> {
  const prisma = createPrismaClient(connectionString);
  try {
    return await fn(prisma);
  } finally {
    await prisma.$disconnect().catch(() => undefined);
  }
}

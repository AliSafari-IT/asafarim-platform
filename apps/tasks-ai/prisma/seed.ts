import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/db/generated";

const connectionString =
  process.env.TASKSAI_DATABASE_URL ??
  "postgres://tasksai:tasksai_dev@127.0.0.1:55438/tasksai";

/**
 * M01 seed: deterministic and tiny. It only touches the HealthProbe
 * singleton so `pnpm db:seed` is safe to run repeatedly and proves a
 * write path to the dedicated database. Domain fixtures (workspaces,
 * projects, tasks) arrive with M02.
 */
async function main() {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  try {
    const probe = await prisma.healthProbe.upsert({
      where: { id: "singleton" },
      create: { id: "singleton", note: "seeded" },
      update: { note: "seeded" },
    });
    console.log(`[tasksai:seed] health_probe ok — checkedAt=${probe.checkedAt.toISOString()}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("[tasksai:seed] failed", err);
  process.exit(1);
});

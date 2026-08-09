// EduMatch demo seed CLI.
//
// This is a thin wrapper. The demo definitions and the mutation logic live in
// @asafarim/seed-manager (definitions/edumatch.ts and providers/edumatch.ts),
// shared with the Admin Console's Seed Data page.
//
// Run packages/db/prisma/seed.ts first for RBAC roles; this seed is otherwise
// independent of it.
//
// Usage: pnpm --filter @asafarim/db db:seed:edumatch

import {
  seedEdumatch,
  validateEdumatchDefinitions,
  withPrisma,
} from "@asafarim/seed-manager";

import { resolveCliDatabaseUrl } from "./seed-cli-env";

async function main() {
  const issues = validateEdumatchDefinitions().filter((i) => i.severity === "error");
  if (issues.length > 0) {
    for (const issue of issues) console.error(`[${issue.code}] ${issue.message}`);
    throw new Error("EduMatch seed definitions are invalid — refusing to seed.");
  }

  await withPrisma(resolveCliDatabaseUrl(), async (prisma) => {
    const result = await seedEdumatch(prisma);
    console.log(`Seeded ${result.students} student profiles.`);
    console.log(`Seeded ${result.tutors} tutor profiles.`);
    console.log("Seeded one full inquiry → booking → payout chain.");
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

// EduMatch demo seed CLI.
//
// This is a thin wrapper. The demo definitions and the mutation logic live in
// @asafarim/seed-manager (definitions/edumatch.ts and providers/edumatch.ts),
// shared with the Admin Console's Seed Data page.
//
// Run packages/db/prisma/seed.ts first. The presentation admins reuse its
// protected `admin` role; every EduMatch-owned row remains independently
// identifiable and removable. EDUMATCH_SEED_USERS_PASSWORD is required and is
// stored only as a bcrypt hash on all 50 presentation members.
//
// Usage: pnpm --filter @asafarim/db db:seed:edumatch

import {
  seedEdumatch,
  validateEdumatchDefinitions,
  withPrisma,
} from "@asafarim/seed-manager";

import { resolveCliDatabaseUrl } from "./seed-cli-env";

async function main() {
  const issues = validateEdumatchDefinitions().filter(
    (i) => i.severity === "error"
  );
  if (issues.length > 0) {
    for (const issue of issues)
      console.error(`[${issue.code}] ${issue.message}`);
    throw new Error(
      "EduMatch seed definitions are invalid — refusing to seed."
    );
  }

  await withPrisma(resolveCliDatabaseUrl(), async (prisma) => {
    const result = await seedEdumatch(prisma);
    console.log(`Seeded ${result.students} student profiles.`);
    console.log(`Seeded ${result.tutors} tutor profiles.`);
    console.log(`Seeded ${result.parents} parent profiles.`);
    console.log(`Seeded ${result.admins} presentation admins.`);
    console.log(
      `Seeded ${result.briefs} Learning Brief scenarios and review-backed history.`
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

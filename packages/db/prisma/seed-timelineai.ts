// TimelineAI demo seed CLI.
//
// This is a thin wrapper. The demo definitions and the mutation logic live in
// @asafarim/seed-manager (definitions/timelineai.ts and
// providers/timelineai.ts), shared with the Admin Console's Seed Data page.
//
// Usage: pnpm --filter @asafarim/db db:seed:timelineai
//        ... db:seed:timelineai -- --only-if-empty   (what deploy passes)

import {
  TIMELINEAI_DEMOS,
  seedTimelineai,
  validateTimelineaiDefinitions,
  withPrisma,
} from "@asafarim/seed-manager";

import { resolveCliDatabaseUrl } from "./seed-cli-env";

async function main() {
  const issues = validateTimelineaiDefinitions().filter((i) => i.severity === "error");
  if (issues.length > 0) {
    for (const issue of issues) console.error(`[${issue.code}] ${issue.message}`);
    throw new Error("TimelineAI seed definitions are invalid — refusing to seed.");
  }

  // `--only-if-empty` is what the deploy job passes. Re-running this seed
  // converges (every row is pinned to a fixed id), but it would also
  // overwrite an edit made to a demo timeline in production — including a
  // moderator unpublishing one. So on deploy we only plant the examples into
  // a database that has no timelines at all.
  const onlyIfEmpty = process.argv.includes("--only-if-empty");

  await withPrisma(resolveCliDatabaseUrl(), async (prisma) => {
    if (onlyIfEmpty) {
      console.log("Planting the TimelineAI demo examples only if no timelines exist.");
    }
    const result = await seedTimelineai(prisma, { onlyIfEmpty });

    if (result.skipped) {
      console.log(
        `Skipping TimelineAI demo seed — database already has ${result.existing} timeline(s).`
      );
      return;
    }

    console.log(
      `Seeded ${TIMELINEAI_DEMOS.length} public example timelines ` +
        `(${result.inserted} created, ${result.updated} refreshed). ` +
        `Visit /t/<publicId>, e.g. /t/${TIMELINEAI_DEMOS[0]!.publicId}`
    );
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

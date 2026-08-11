/**
 * One-time backfill for the multi-aspect ratings migration
 * (20260811120000_add_multi_aspect_ratings).
 *
 * Populates the new cached columns (clarityAvg/reliabilityAvg/engagementAvg/
 * aspectedCount) on EduTutorProfile from existing EduReview rows. Legacy
 * reviews have null sub-ratings, so tutors with only legacy reviews end up
 * with aspectedCount = 0 and null aspect averages — expected, not a bug.
 *
 * Usage: pnpm --filter @asafarim/edumatch exec tsx scripts/backfill-rating-aggregates.ts
 */

import { prisma } from "@asafarim/db";
import { refreshTutorRating } from "../lib/server/learning-journey";

async function main() {
  const tutors = await prisma.eduTutorProfile.findMany({ select: { userId: true } });
  console.log(`Backfilling rating aggregates for ${tutors.length} tutor(s)…`);

  let done = 0;
  for (const t of tutors) {
    await refreshTutorRating(t.userId);
    done += 1;
    if (done % 50 === 0) console.log(`  ${done}/${tutors.length}`);
  }

  console.log(`Done. ${done} tutor profile(s) updated.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

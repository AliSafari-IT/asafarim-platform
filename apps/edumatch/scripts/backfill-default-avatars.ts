/**
 * One-time backfill for the student avatar system (#141,
 * 20260811150000_add_student_date_of_birth).
 *
 * - Students with no `User.image` get the default drawn avatar.
 * - Students who are under 13 (or have no dateOfBirth on file — the safest
 *   default) but somehow already have a non-preset image (e.g. an OAuth
 *   profile photo carried over before this feature existed) are reset to
 *   the default drawn avatar, since real photos are gated at 13+.
 *
 * 13+ students with an existing photo are left untouched — the rule is
 * "no photos below 13", not "everyone gets a drawn avatar forever".
 *
 * Usage: pnpm --filter @asafarim/edumatch exec tsx scripts/backfill-default-avatars.ts
 */

import { prisma } from "@asafarim/db";
import { applyDefaultAvatarIfNeeded } from "../lib/server/avatars";

async function main() {
  const students = await prisma.eduStudentProfile.findMany({
    select: { userId: true, dateOfBirth: true },
  });
  console.log(`Checking avatars for ${students.length} student(s)…`);

  let touched = 0;
  for (const s of students) {
    const before = await prisma.user.findUnique({
      where: { id: s.userId },
      select: { image: true },
    });
    await applyDefaultAvatarIfNeeded(s.userId, s.dateOfBirth);
    const after = await prisma.user.findUnique({
      where: { id: s.userId },
      select: { image: true },
    });
    if (before?.image !== after?.image) touched += 1;
  }

  console.log(`Done. ${touched} student(s) updated to a default drawn avatar.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

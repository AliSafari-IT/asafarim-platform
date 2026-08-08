// EduMatch demo seed: a small, deterministic, fully synthetic dataset for
// local development and staging — enough to exercise every stage of the
// student→tutor flow (inquiry → AI response → quote → booking → payout)
// without touching Stripe, sending real email, or using real identities.
//
// Safe to run against a freshly migrated database and safe to re-run: every
// row is upserted on a fixed, deterministic key (email for users; a fixed
// "seed-*" id for rows with no natural unique key), so running this twice
// converges instead of duplicating. Nothing here depends on
// SEED_ADMIN_EMAIL/PASSWORD or packages/db/prisma/seed.ts — run that first
// for RBAC roles, then this for EduMatch content. Independent of it
// otherwise.
//
// Usage: pnpm --filter @asafarim/db db:seed:edumatch

import { existsSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

function resolveDatabaseUrl(): string {
  const raw =
    process.env.DATABASE_URL ??
    "postgresql://asafarim:asafarim_dev@localhost:5432/asafarim";

  const insideContainer = existsSync("/.dockerenv");
  if (insideContainer) return raw;

  try {
    const url = new URL(raw);
    if (url.hostname === "postgres") {
      url.hostname = "localhost";
      console.log(
        "DATABASE_URL host 'postgres' is not resolvable outside Docker — using localhost instead."
      );
      return url.toString();
    }
  } catch {
    // Fall through with the raw value; Prisma will report a clearer error.
  }
  return raw;
}

const adapter = new PrismaPg({ connectionString: resolveDatabaseUrl() });
const prisma = new PrismaClient({ adapter });

// No password hash needed — these accounts are for browsing seeded data via
// the admin console and API, not for signing in as. If sign-in is ever
// needed, use Hub's normal sign-up flow with these same emails.

async function upsertUser(email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, emailVerified: new Date() },
  });
}

async function seedStudents() {
  const students = [
    { email: "demo.student1@edumatch.demo", name: "Nora Demo", gradeLevel: "UNDERGRAD", subjects: ["Mathematics", "Physics"] },
    { email: "demo.student2@edumatch.demo", name: "Idris Demo", gradeLevel: "K12", subjects: ["Chemistry"] },
    { email: "demo.student3@edumatch.demo", name: "Yara Demo", gradeLevel: "GRAD", subjects: ["Computer Science", "Statistics"] },
  ];

  const rows = [];
  for (const s of students) {
    const user = await upsertUser(s.email, s.name);
    await prisma.eduStudentProfile.upsert({
      where: { userId: user.id },
      update: { gradeLevel: s.gradeLevel, subjectsOfInterest: s.subjects },
      create: { userId: user.id, gradeLevel: s.gradeLevel, subjectsOfInterest: s.subjects },
    });
    rows.push({ user, ...s });
  }
  console.log(`Seeded ${rows.length} student profiles.`);
  return rows;
}

async function seedTutors() {
  const tutors = [
    {
      email: "demo.tutor1@edumatch.demo",
      name: "Priya Demo",
      subjects: ["Mathematics", "Physics"],
      levels: ["K12", "UNDERGRAD"],
      hourlyRateCents: 4500,
      verified: true,
      ratingAvg: 4.8,
      ratingCount: 21,
    },
    {
      email: "demo.tutor2@edumatch.demo",
      name: "Marcus Demo",
      subjects: ["Chemistry", "Biology"],
      levels: ["K12"],
      hourlyRateCents: 3800,
      verified: true,
      ratingAvg: 4.5,
      ratingCount: 9,
    },
    {
      email: "demo.tutor3@edumatch.demo",
      name: "Sofia Demo",
      subjects: ["Computer Science"],
      levels: ["UNDERGRAD", "GRAD"],
      hourlyRateCents: 5200,
      verified: false,
      ratingAvg: 0,
      ratingCount: 0,
    },
  ];

  const rows = [];
  for (const t of tutors) {
    const user = await upsertUser(t.email, t.name);
    await prisma.eduTutorProfile.upsert({
      where: { userId: user.id },
      update: {
        subjectsTaught: t.subjects,
        levelsTaught: t.levels,
        hourlyRateCents: t.hourlyRateCents,
        verifiedAt: t.verified ? new Date() : null,
        ratingAvg: t.ratingAvg,
        ratingCount: t.ratingCount,
        bio: `Demo tutor profile for ${t.name} — synthetic seed data.`,
      },
      create: {
        userId: user.id,
        subjectsTaught: t.subjects,
        levelsTaught: t.levels,
        hourlyRateCents: t.hourlyRateCents,
        onlineOnly: true,
        verifiedAt: t.verified ? new Date() : null,
        ratingAvg: t.ratingAvg,
        ratingCount: t.ratingCount,
        bio: `Demo tutor profile for ${t.name} — synthetic seed data.`,
      },
    });
    rows.push({ user, ...t });
  }
  console.log(`Seeded ${rows.length} tutor profiles.`);
  return rows;
}

/**
 * A full inquiry → AI response → quote request → quote → booking → payment
 * → wallet credit chain, so every EduMatch surface (Requests, Bookings,
 * Quotes, Payments, admin Users & Tutors) has something real to render.
 */
async function seedBookingFlow(studentId: string, tutorId: string) {
  const inquiry = await prisma.eduInquiry.upsert({
    where: { id: "seed-inquiry-1" },
    update: {},
    create: {
      id: "seed-inquiry-1",
      studentId,
      subject: "Mathematics",
      gradeLevel: "UNDERGRAD",
      description: "Struggling with second-order differential equations before a midterm — synthetic seed data.",
      status: "BOOKED",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });

  await prisma.eduAiResponse.upsert({
    where: { id: "seed-ai-response-1" },
    update: {},
    create: {
      id: "seed-ai-response-1",
      inquiryId: inquiry.id,
      modelUsed: "seed-fixture",
      promptVersion: "v0-seed",
      explanation: "Worked example covering homogeneous and particular solutions — synthetic seed data, not real model output.",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });

  const quoteRequest = await prisma.eduQuoteRequest.upsert({
    where: { id: "seed-quote-request-1" },
    update: {},
    create: {
      id: "seed-quote-request-1",
      inquiryId: inquiry.id,
      studentId,
      status: "FULFILLED",
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    },
  });

  const quote = await prisma.eduQuote.upsert({
    where: { quoteRequestId_tutorId: { quoteRequestId: quoteRequest.id, tutorId } },
    update: {},
    create: {
      quoteRequestId: quoteRequest.id,
      tutorId,
      hourlyRateCents: 4500,
      estimatedHours: 2,
      totalCents: 9000,
      status: "ACCEPTED",
      notes: "Two 1-hour sessions covering the exam syllabus — synthetic seed data.",
    },
  });

  const booking = await prisma.eduBooking.upsert({
    where: { quoteId: quote.id },
    update: {},
    create: {
      quoteId: quote.id,
      studentId,
      tutorId,
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      durationMinutes: 60,
      mode: "ONLINE",
      status: "SCHEDULED",
    },
  });

  await prisma.eduTransaction.upsert({
    where: { id: "seed-transaction-1" },
    update: {},
    create: {
      id: "seed-transaction-1",
      bookingId: booking.id,
      tutorId,
      type: "CHARGE",
      grossCents: 9000,
      platformFeeCents: 1350,
      netCents: 7650,
    },
  });

  await prisma.eduWallet.upsert({
    where: { tutorId },
    update: {},
    create: { tutorId, balanceCents: 7650, currency: "EUR" },
  });

  await prisma.eduNotification.upsert({
    where: { id: "seed-notification-1" },
    update: {},
    create: {
      id: "seed-notification-1",
      userId: studentId,
      type: "BOOKING_CONFIRMED",
      payload: { bookingId: booking.id },
      sentAt: new Date(),
    },
  });

  console.log("Seeded one full inquiry → booking → payout chain.");
}

async function main() {
  const students = await seedStudents();
  const tutors = await seedTutors();
  await seedBookingFlow(students[0]!.user.id, tutors[0]!.user.id);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

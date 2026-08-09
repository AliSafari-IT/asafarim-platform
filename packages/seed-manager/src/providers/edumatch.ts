// EduMatch provider — synthetic demo dataset on the shared Prisma database.
//
// Ownership is provable two ways: demo identities live on the reserved
// `@edumatch.demo` email domain, and every row in the booking chain is pinned
// to a fixed `seed-*` id. Removal touches nothing outside those two sets, and
// a demo user is retained whenever it owns data the seed did not create.

import { definitionChecksum } from "../checksums";
import type {
  SeedEntityCounts,
  SeedIssue,
  SeedPlan,
  SeedPlanChange,
  SeedProvider,
  SeedProviderContext,
  SeedResult,
  SeedStatus,
  ValidationResult,
} from "../contracts";
import { requiredEnvVars } from "../environments";
import { sanitizeError } from "../redaction";
import { withPrisma, type SeedPrismaClient } from "../prisma-client";
import { buildPlan, unavailableStatus } from "./platform-foundation";
import {
  EDUMATCH_CHAIN_IDS,
  EDUMATCH_DEFINITIONS,
  EDUMATCH_DEFINITION_VERSION,
  EDUMATCH_DEMO_EMAILS,
  EDUMATCH_DEMO_EMAIL_DOMAIN,
  EDUMATCH_STUDENTS,
  EDUMATCH_TUTORS,
} from "../definitions/edumatch";

const PROVIDER_ID = "edumatch";
const DEFINITION_CHECKSUM = definitionChecksum(EDUMATCH_DEFINITIONS);
const DEFINITION = { version: EDUMATCH_DEFINITION_VERSION, checksum: DEFINITION_CHECKSUM };

const KEY_STUDENTS = "edumatch.students";
const KEY_TUTORS = "edumatch.tutors";
const KEY_CHAIN = "edumatch.booking-chain";

// ─── Validation ──────────────────────────────────────────────────────────

export function validateEdumatchDefinitions(): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const seen = new Set<string>();
  for (const email of EDUMATCH_DEMO_EMAILS) {
    if (seen.has(email)) {
      issues.push({
        code: "DUPLICATE_EMAIL",
        severity: "error",
        message: `Demo email "${email}" is defined more than once.`,
      });
    }
    seen.add(email);
    if (!email.endsWith(EDUMATCH_DEMO_EMAIL_DOMAIN)) {
      // Without the reserved domain there is no provable ownership, so
      // removal could reach a real account. Treat it as a hard error.
      issues.push({
        code: "EMAIL_OUTSIDE_RESERVED_DOMAIN",
        severity: "error",
        message: `Demo identity "${email}" is outside the reserved ${EDUMATCH_DEMO_EMAIL_DOMAIN} domain, so its ownership is not provable.`,
      });
    }
  }
  for (const id of Object.values(EDUMATCH_CHAIN_IDS)) {
    if (!id.startsWith("seed-")) {
      issues.push({
        code: "CHAIN_ID_NOT_PREFIXED",
        severity: "error",
        seedKey: KEY_CHAIN,
        message: `Booking-chain id "${id}" must start with "seed-".`,
      });
    }
  }
  return issues;
}

// ─── Reusable mutation functions (shared with the CLI) ───────────────────

async function upsertDemoUser(prisma: SeedPrismaClient, email: string, name: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name },
    create: { email, name, emailVerified: new Date() },
  });
}

export async function applyStudents(prisma: SeedPrismaClient) {
  const rows = [];
  for (const student of EDUMATCH_STUDENTS) {
    const user = await upsertDemoUser(prisma, student.email, student.name);
    await prisma.eduStudentProfile.upsert({
      where: { userId: user.id },
      update: { gradeLevel: student.gradeLevel, subjectsOfInterest: student.subjects },
      create: { userId: user.id, gradeLevel: student.gradeLevel, subjectsOfInterest: student.subjects },
    });
    rows.push({ user, ...student });
  }
  return rows;
}

export async function applyTutors(prisma: SeedPrismaClient) {
  const rows = [];
  for (const tutor of EDUMATCH_TUTORS) {
    const user = await upsertDemoUser(prisma, tutor.email, tutor.name);
    const shared = {
      subjectsTaught: tutor.subjects,
      levelsTaught: tutor.levels,
      hourlyRateCents: tutor.hourlyRateCents,
      verifiedAt: tutor.verified ? new Date() : null,
      ratingAvg: tutor.ratingAvg,
      ratingCount: tutor.ratingCount,
      bio: `Demo tutor profile for ${tutor.name} — synthetic seed data.`,
    };
    await prisma.eduTutorProfile.upsert({
      where: { userId: user.id },
      update: shared,
      create: { userId: user.id, onlineOnly: true, ...shared },
    });
    rows.push({ user, ...tutor });
  }
  return rows;
}

/**
 * A full inquiry → AI response → quote → booking → payment → wallet chain, so
 * every EduMatch surface has something real to render.
 */
export async function applyBookingChain(
  prisma: SeedPrismaClient,
  studentId: string,
  tutorId: string
) {
  const inquiry = await prisma.eduInquiry.upsert({
    where: { id: EDUMATCH_CHAIN_IDS.inquiry },
    update: {},
    create: {
      id: EDUMATCH_CHAIN_IDS.inquiry,
      studentId,
      subject: "Mathematics",
      gradeLevel: "UNDERGRAD",
      description:
        "Struggling with second-order differential equations before a midterm — synthetic seed data.",
      status: "BOOKED",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });

  await prisma.eduAiResponse.upsert({
    where: { id: EDUMATCH_CHAIN_IDS.aiResponse },
    update: {},
    create: {
      id: EDUMATCH_CHAIN_IDS.aiResponse,
      inquiryId: inquiry.id,
      modelUsed: "seed-fixture",
      promptVersion: "v0-seed",
      explanation:
        "Worked example covering homogeneous and particular solutions — synthetic seed data, not real model output.",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });

  const quoteRequest = await prisma.eduQuoteRequest.upsert({
    where: { id: EDUMATCH_CHAIN_IDS.quoteRequest },
    update: {},
    create: {
      id: EDUMATCH_CHAIN_IDS.quoteRequest,
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
    where: { id: EDUMATCH_CHAIN_IDS.transaction },
    update: {},
    create: {
      id: EDUMATCH_CHAIN_IDS.transaction,
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
    where: { id: EDUMATCH_CHAIN_IDS.notification },
    update: {},
    create: {
      id: EDUMATCH_CHAIN_IDS.notification,
      userId: studentId,
      type: "BOOKING_CONFIRMED",
      payload: { bookingId: booking.id },
      sentAt: new Date(),
    },
  });

  return { inquiry, quoteRequest, quote, booking };
}

/** The whole EduMatch demo seed, as the CLI runs it. */
export async function seedEdumatch(prisma: SeedPrismaClient) {
  const students = await applyStudents(prisma);
  const tutors = await applyTutors(prisma);
  await applyBookingChain(prisma, students[0]!.user.id, tutors[0]!.user.id);
  return { students: students.length, tutors: tutors.length };
}

// ─── Inspection ──────────────────────────────────────────────────────────

interface EdumatchSnapshot {
  entities: SeedEntityCounts[];
  seedOwnedCount: number;
  missingCount: number;
  driftedCount: number;
  orphanedCount: number;
  presentEmails: string[];
  orphanEmails: string[];
  chainPresent: number;
}

const CHAIN_ID_LIST = Object.values(EDUMATCH_CHAIN_IDS);

async function snapshot(prisma: SeedPrismaClient): Promise<EdumatchSnapshot> {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: EDUMATCH_DEMO_EMAIL_DOMAIN } },
    select: {
      email: true,
      name: true,
      eduStudentProfile: { select: { userId: true } },
      eduTutorProfile: { select: { userId: true, hourlyRateCents: true } },
    },
  });
  const byEmail = new Map(demoUsers.map((user) => [user.email, user]));

  let studentsPresent = 0;
  let studentsDrifted = 0;
  for (const student of EDUMATCH_STUDENTS) {
    const row = byEmail.get(student.email);
    if (!row?.eduStudentProfile) continue;
    studentsPresent += 1;
    if (row.name !== student.name) studentsDrifted += 1;
  }

  let tutorsPresent = 0;
  let tutorsDrifted = 0;
  for (const tutor of EDUMATCH_TUTORS) {
    const row = byEmail.get(tutor.email);
    if (!row?.eduTutorProfile) continue;
    tutorsPresent += 1;
    if (row.name !== tutor.name || row.eduTutorProfile.hourlyRateCents !== tutor.hourlyRateCents) {
      tutorsDrifted += 1;
    }
  }

  const [inquiries, aiResponses, quoteRequests, transactions, notifications] =
    await Promise.all([
      prisma.eduInquiry.count({ where: { id: EDUMATCH_CHAIN_IDS.inquiry } }),
      prisma.eduAiResponse.count({ where: { id: EDUMATCH_CHAIN_IDS.aiResponse } }),
      prisma.eduQuoteRequest.count({ where: { id: EDUMATCH_CHAIN_IDS.quoteRequest } }),
      prisma.eduTransaction.count({ where: { id: EDUMATCH_CHAIN_IDS.transaction } }),
      prisma.eduNotification.count({ where: { id: EDUMATCH_CHAIN_IDS.notification } }),
    ]);
  const chainPresent = inquiries + aiResponses + quoteRequests + transactions + notifications;

  const known = new Set(EDUMATCH_DEMO_EMAILS);
  const orphanEmails = demoUsers.map((u) => u.email).filter((email) => !known.has(email));

  const entities: SeedEntityCounts[] = [
    {
      entity: "Demo students",
      seedKey: KEY_STUDENTS,
      present: studentsPresent,
      missing: EDUMATCH_STUDENTS.length - studentsPresent,
      drifted: studentsDrifted,
      orphaned: 0,
    },
    {
      entity: "Demo tutors",
      seedKey: KEY_TUTORS,
      present: tutorsPresent,
      missing: EDUMATCH_TUTORS.length - tutorsPresent,
      drifted: tutorsDrifted,
      orphaned: orphanEmails.length,
    },
    {
      entity: "Booking chain",
      seedKey: KEY_CHAIN,
      present: chainPresent,
      missing: CHAIN_ID_LIST.length - chainPresent,
      drifted: 0,
      orphaned: 0,
    },
  ];

  return {
    entities,
    seedOwnedCount: entities.reduce((total, e) => total + e.present, 0),
    missingCount: entities.reduce((total, e) => total + e.missing, 0),
    driftedCount: entities.reduce((total, e) => total + e.drifted, 0),
    orphanedCount: orphanEmails.length,
    presentEmails: EDUMATCH_DEMO_EMAILS.filter((email) => byEmail.has(email)),
    orphanEmails,
    chainPresent,
  };
}

function healthOf(snap: Pick<EdumatchSnapshot, "missingCount" | "driftedCount" | "orphanedCount">) {
  if (snap.missingCount > 0) return "missing" as const;
  if (snap.driftedCount > 0) return "drifted" as const;
  if (snap.orphanedCount > 0) return "orphaned" as const;
  return "clean" as const;
}

/**
 * Whether a demo user may be deleted. Even on the reserved domain we refuse
 * when the account has been used for real: a linked sign-in account, an
 * active session, a role grant, or content outside the seeded chain.
 */
async function userRetentionReasons(
  prisma: SeedPrismaClient,
  emails: string[]
): Promise<Map<string, string>> {
  const reasons = new Map<string, string>();
  if (emails.length === 0) return reasons;

  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      _count: { select: { accounts: true, sessions: true, userRoles: true } },
    },
  });

  for (const user of users) {
    if (user._count.accounts > 0) {
      reasons.set(user.email, "has linked sign-in accounts");
      continue;
    }
    if (user._count.sessions > 0) {
      reasons.set(user.email, "has active sessions");
      continue;
    }
    if (user._count.userRoles > 0) {
      reasons.set(user.email, "has role assignments");
      continue;
    }
    const [otherInquiries, otherBookings] = await Promise.all([
      prisma.eduInquiry.count({
        where: { studentId: user.id, id: { notIn: [EDUMATCH_CHAIN_IDS.inquiry] } },
      }),
      prisma.eduBooking.count({
        where: {
          OR: [{ studentId: user.id }, { tutorId: user.id }],
          quote: { quoteRequestId: { not: EDUMATCH_CHAIN_IDS.quoteRequest } },
        },
      }),
    ]);
    if (otherInquiries > 0 || otherBookings > 0) {
      reasons.set(user.email, "owns EduMatch activity this seed did not create");
    }
  }
  return reasons;
}

// ─── Provider ────────────────────────────────────────────────────────────

export const edumatchProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "edumatch",
  displayName: "EduMatch",
  description:
    "Synthetic demo students, tutors and one full inquiry→booking→payout chain on the shared platform database.",
  databaseKind: "shared-prisma",
  availability: "configured",
  protected: false,
  definitionVersion: EDUMATCH_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("shared-prisma"),
  supports: { validate: true, status: true, seed: true, reconcile: true, remove: true },
  manifest: [
    {
      seedKey: KEY_STUDENTS,
      entity: "User + EduStudentProfile",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      reconcilable: true,
      removable: true,
      protectedFields: ["password"],
      notes: `Identified by the reserved ${EDUMATCH_DEMO_EMAIL_DOMAIN} email domain. Retained if the account has been used for real.`,
    },
    {
      seedKey: KEY_TUTORS,
      entity: "User + EduTutorProfile",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      reconcilable: true,
      removable: true,
      protectedFields: ["password"],
      userControlledFields: ["verifiedAt"],
      notes: `Identified by the reserved ${EDUMATCH_DEMO_EMAIL_DOMAIN} email domain.`,
    },
    {
      seedKey: KEY_CHAIN,
      entity: "EduInquiry / Quote / Booking / Transaction",
      identity: "id",
      ownership: "seed-owned",
      dependsOn: [KEY_STUDENTS, KEY_TUTORS],
      reconcilable: true,
      removable: true,
      notes: `Fixed ids: ${CHAIN_ID_LIST.join(", ")}. Descendant rows cascade.`,
    },
  ],

  async validate(context): Promise<ValidationResult> {
    const startedAt = Date.now();
    const issues = validateEdumatchDefinitions();
    let connection: ValidationResult["connection"] = "ok";
    try {
      await withPrisma(context.connectionString, async (prisma) => {
        await prisma.$queryRaw`SELECT 1`;
        await prisma.eduInquiry.count();
      });
    } catch (error) {
      connection = "unreachable";
      const { code, message } = sanitizeError(error);
      issues.push({ code, severity: "error", message });
    }
    return {
      ok: connection === "ok" && !issues.some((i) => i.severity === "error"),
      definitionVersion: EDUMATCH_DEFINITION_VERSION,
      definitionChecksum: DEFINITION_CHECKSUM,
      connection,
      issues,
      checkedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
    };
  },

  async inspect(context): Promise<SeedStatus> {
    const startedAt = Date.now();
    try {
      const snap = await withPrisma(context.connectionString, snapshot);
      return {
        health: healthOf(snap),
        definitionVersion: EDUMATCH_DEFINITION_VERSION,
        definitionChecksum: DEFINITION_CHECKSUM,
        connection: "ok",
        seedOwnedCount: snap.seedOwnedCount,
        missingCount: snap.missingCount,
        driftedCount: snap.driftedCount,
        orphanedCount: snap.orphanedCount,
        entities: snap.entities,
        issues: snap.orphanEmails.length
          ? [
              {
                code: "ORPHANED_SEED_ROWS",
                severity: "warning",
                seedKey: KEY_TUTORS,
                message: `${snap.orphanEmails.length} demo identity/identities exist on the reserved domain that the current code no longer defines.`,
              },
            ]
          : [],
        checkedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return unavailableStatus(code, message, startedAt, DEFINITION);
    }
  },

  async plan(context, operation): Promise<SeedPlan> {
    const createdAt = Date.now();
    const changes: SeedPlanChange[] = [];
    const warnings: SeedIssue[] = [];

    await withPrisma(context.connectionString, async (prisma) => {
      const snap = await snapshot(prisma);

      if (operation === "remove") {
        const candidates = [...snap.presentEmails, ...snap.orphanEmails];
        const retention = await userRetentionReasons(prisma, candidates);

        if (snap.chainPresent > 0) {
          changes.push({
            seedKey: KEY_CHAIN,
            entity: "Booking chain",
            action: "delete",
            count: snap.chainPresent,
          });
        }

        const deletable = candidates.filter((email) => !retention.has(email));
        const students = deletable.filter((email) =>
          EDUMATCH_STUDENTS.some((s) => s.email === email)
        ).length;
        const tutors = deletable.length - students;
        if (students > 0) {
          changes.push({ seedKey: KEY_STUDENTS, entity: "Demo students", action: "delete", count: students });
        }
        if (tutors > 0) {
          changes.push({ seedKey: KEY_TUTORS, entity: "Demo tutors / orphans", action: "delete", count: tutors });
        }
        for (const [email, reason] of retention) {
          changes.push({
            seedKey: EDUMATCH_STUDENTS.some((s) => s.email === email) ? KEY_STUDENTS : KEY_TUTORS,
            entity: "Demo identity",
            action: "retain",
            count: 1,
            reason: `${email} retained — it ${reason}.`,
          });
        }
        if (retention.size > 0) {
          warnings.push({
            code: "SHARED_USERS_RETAINED",
            severity: "warning",
            message: `${retention.size} demo identity/identities will be kept because they hold data this seed did not create.`,
          });
        }
        return;
      }

      for (const entity of snap.entities) {
        if (entity.missing > 0) {
          changes.push({ seedKey: entity.seedKey, entity: entity.entity, action: "insert", count: entity.missing });
        }
        if (entity.drifted > 0) {
          changes.push(
            operation === "reconcile"
              ? { seedKey: entity.seedKey, entity: entity.entity, action: "update", count: entity.drifted }
              : {
                  seedKey: entity.seedKey,
                  entity: entity.entity,
                  action: "retain",
                  count: entity.drifted,
                  reason: "Drifted rows are left alone by “Seed missing”. Use Reconcile to refresh them.",
                }
          );
        }
      }
      if (snap.orphanEmails.length > 0) {
        changes.push({
          seedKey: KEY_TUTORS,
          entity: "Orphaned demo identities",
          action: "retain",
          count: snap.orphanEmails.length,
          reason: "Reconcile never prunes. Use “Remove seeded data” to clear orphans.",
        });
      }
    });

    return buildPlan({
      providerId: PROVIDER_ID,
      environment: context.environment,
      operation,
      changes,
      blocked: [],
      warnings,
      createdAt,
      definitionVersion: EDUMATCH_DEFINITION_VERSION,
      definitionChecksum: DEFINITION_CHECKSUM,
    });
  },

  async execute(context, approvedPlan): Promise<SeedResult> {
    const startedAt = Date.now();
    try {
      const outcome = await withPrisma(context.connectionString, async (prisma) => {
        if (approvedPlan.operation === "remove") return removeEdumatch(prisma, context);
        context.report?.({ stage: "executing", message: "Seeding EduMatch demo data", percent: 30 });
        const applied = await seedEdumatch(prisma);
        context.report?.({ stage: "verifying", message: "Re-inspecting", percent: 90 });
        const verified = await snapshot(prisma);
        return {
          perEntity: [
            { seedKey: KEY_STUDENTS, entity: "Demo students", action: "update" as const, count: applied.students },
            { seedKey: KEY_TUTORS, entity: "Demo tutors", action: "update" as const, count: applied.tutors },
          ],
          deleted: 0,
          retained: 0,
          verified,
        };
      });

      return {
        ok: true,
        partial: false,
        inserted: sumBy(outcome.perEntity, "insert"),
        updated: sumBy(outcome.perEntity, "update"),
        deleted: outcome.deleted,
        retained: outcome.retained,
        perEntity: outcome.perEntity,
        issues: [],
        verifiedStatus: {
          health: healthOf(outcome.verified),
          definitionVersion: EDUMATCH_DEFINITION_VERSION,
          definitionChecksum: DEFINITION_CHECKSUM,
          connection: "ok",
          seedOwnedCount: outcome.verified.seedOwnedCount,
          missingCount: outcome.verified.missingCount,
          driftedCount: outcome.verified.driftedCount,
          orphanedCount: outcome.verified.orphanedCount,
          entities: outcome.verified.entities,
          issues: [],
          checkedAt: new Date().toISOString(),
          durationMs: 0,
        },
        durationMs: Date.now() - startedAt,
      };
    } catch (error) {
      const { code, message } = sanitizeError(error);
      return {
        ok: false,
        partial: false,
        inserted: 0,
        updated: 0,
        deleted: 0,
        retained: 0,
        perEntity: [],
        issues: [{ code, severity: "error", message }],
        durationMs: Date.now() - startedAt,
      };
    }
  },
};

function sumBy(changes: SeedPlanChange[], action: SeedPlanChange["action"]): number {
  return changes.filter((c) => c.action === action).reduce((total, c) => total + c.count, 0);
}

/**
 * FK-safe, allowlist-only removal in one transaction: the pinned booking-chain
 * rows first (descendants cascade), then only those reserved-domain users that
 * hold nothing the seed did not create.
 */
async function removeEdumatch(prisma: SeedPrismaClient, context: SeedProviderContext) {
  const snap = await snapshot(prisma);
  const candidates = [...snap.presentEmails, ...snap.orphanEmails];
  const retention = await userRetentionReasons(prisma, candidates);
  const deletableEmails = candidates.filter((email) => !retention.has(email));

  context.report?.({ stage: "executing", message: "Removing seed-owned rows", percent: 40 });

  const result = await prisma.$transaction(async (tx) => {
    // Leaves → roots. Quote/booking/wallet rows hang off these and cascade.
    const notifications = await tx.eduNotification.deleteMany({
      where: { id: EDUMATCH_CHAIN_IDS.notification },
    });
    const transactions = await tx.eduTransaction.deleteMany({
      where: { id: EDUMATCH_CHAIN_IDS.transaction },
    });
    const quoteRequests = await tx.eduQuoteRequest.deleteMany({
      where: { id: EDUMATCH_CHAIN_IDS.quoteRequest },
    });
    const aiResponses = await tx.eduAiResponse.deleteMany({
      where: { id: EDUMATCH_CHAIN_IDS.aiResponse },
    });
    const inquiries = await tx.eduInquiry.deleteMany({
      where: { id: EDUMATCH_CHAIN_IDS.inquiry },
    });

    // Only ever inside the reserved domain, and only the vetted subset.
    const users = deletableEmails.length
      ? await tx.user.deleteMany({
          where: {
            email: { in: deletableEmails, endsWith: EDUMATCH_DEMO_EMAIL_DOMAIN },
          },
        })
      : { count: 0 };

    return {
      chain:
        notifications.count +
        transactions.count +
        quoteRequests.count +
        aiResponses.count +
        inquiries.count,
      users: users.count,
    };
  });

  context.report?.({ stage: "verifying", message: "Re-inspecting", percent: 90 });
  const verified = await snapshot(prisma);

  const perEntity: SeedPlanChange[] = ([
    { seedKey: KEY_CHAIN, entity: "Booking chain", action: "delete", count: result.chain },
    { seedKey: KEY_STUDENTS, entity: "Demo identities", action: "delete", count: result.users },
  ] as SeedPlanChange[]).filter((change) => change.count > 0);

  for (const [email, reason] of retention) {
    perEntity.push({
      seedKey: KEY_STUDENTS,
      entity: "Demo identity",
      action: "retain",
      count: 1,
      reason: `${email} retained — it ${reason}.`,
    });
  }

  return {
    perEntity,
    deleted: result.chain + result.users,
    retained: retention.size,
    verified,
  };
}

export { DEFINITION_CHECKSUM as EDUMATCH_DEFINITION_CHECKSUM };

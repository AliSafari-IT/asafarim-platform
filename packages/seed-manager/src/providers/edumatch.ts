// EduMatch presentation provider: a deterministic 50-member demo universe.

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
  EDUMATCH_ADMINS,
  EDUMATCH_BRIEFS,
  EDUMATCH_CHAIN_IDS,
  EDUMATCH_DEFINITIONS,
  EDUMATCH_DEFINITION_VERSION,
  EDUMATCH_DEMO_EMAILS,
  EDUMATCH_DEMO_EMAIL_DOMAIN,
  EDUMATCH_ID_PREFIX,
  EDUMATCH_MATCH_PLAN,
  EDUMATCH_PARENTS,
  EDUMATCH_STUDENTS,
  EDUMATCH_TUTORS,
  edumatchSeedId,
  type DemoBrief,
  type DemoTutor,
} from "../definitions/edumatch";

const PROVIDER_ID = "edumatch";
const DEFINITION_CHECKSUM = definitionChecksum(EDUMATCH_DEFINITIONS);
const DEFINITION = {
  version: EDUMATCH_DEFINITION_VERSION,
  checksum: DEFINITION_CHECKSUM,
};

const KEY_STUDENTS = "edumatch.students";
const KEY_TUTORS = "edumatch.tutors";
const KEY_PARENTS = "edumatch.parents";
const KEY_ADMINS = "edumatch.admins";
const KEY_SCENARIOS = "edumatch.presentation-scenarios";

const DAY = 24 * 60 * 60 * 1000;
const dateFromNow = (days: number, hours = 0) =>
  new Date(Date.now() + days * DAY + hours * 60 * 60 * 1000);
const dateOnly = (value: string) => new Date(`${value}T12:00:00.000Z`);

type SeedUser = Awaited<ReturnType<typeof upsertDemoUser>>;
type UserMap = Map<string, SeedUser>;

function seedAttachments(key: string) {
  if (key === "S21") {
    return [
      {
        type: "audio",
        url: "seed://edumatch/audio/french-pronunciation.m4a",
        mime: "audio/mp4",
        sizeBytes: 184_320,
        transcript: "Bonjour, je voudrais améliorer ma prononciation.",
      },
    ];
  }
  if (key === "S22") {
    return [
      {
        type: "image",
        url: "seed://edumatch/images/query-plan.png",
        mime: "image/png",
        sizeBytes: 96_240,
      },
    ];
  }
  return undefined;
}

export function validateEdumatchDefinitions(): SeedIssue[] {
  const issues: SeedIssue[] = [];
  const emails = new Set<string>();
  const keys = new Set<string>();

  for (const value of EDUMATCH_DEMO_EMAILS) {
    if (emails.has(value)) {
      issues.push({
        code: "DUPLICATE_EMAIL",
        severity: "error",
        message: `Demo email "${value}" is defined more than once.`,
      });
    }
    emails.add(value);
    if (!value.endsWith(EDUMATCH_DEMO_EMAIL_DOMAIN)) {
      issues.push({
        code: "EMAIL_OUTSIDE_RESERVED_DOMAIN",
        severity: "error",
        message: `Demo identity "${value}" is outside ${EDUMATCH_DEMO_EMAIL_DOMAIN}.`,
      });
    }
  }

  for (const member of [
    ...EDUMATCH_STUDENTS,
    ...EDUMATCH_TUTORS,
    ...EDUMATCH_PARENTS,
    ...EDUMATCH_ADMINS,
  ]) {
    if (keys.has(member.key)) {
      issues.push({
        code: "DUPLICATE_MEMBER_KEY",
        severity: "error",
        message: `Demo member key "${member.key}" is duplicated.`,
      });
    }
    keys.add(member.key);
  }

  if (EDUMATCH_DEMO_EMAILS.length !== 50) {
    issues.push({
      code: "MEMBER_COUNT",
      severity: "error",
      message: `Expected exactly 50 members; found ${EDUMATCH_DEMO_EMAILS.length}.`,
    });
  }
  const hybrid = EDUMATCH_TUTORS.filter((tutor) => !tutor.onlineOnly).length;
  const online = EDUMATCH_TUTORS.filter((tutor) => tutor.onlineOnly).length;
  if (EDUMATCH_TUTORS.length !== 15 || hybrid !== 10 || online !== 5) {
    issues.push({
      code: "TUTOR_MODE_SPLIT",
      severity: "error",
      message: `Expected 15 tutors split 10 hybrid/5 online-only; found ${EDUMATCH_TUTORS.length}, ${hybrid}/${online}.`,
    });
  }

  const parentKeys = new Set(EDUMATCH_PARENTS.map((parent) => parent.key));
  for (const student of EDUMATCH_STUDENTS) {
    if (student.parentKey && !parentKeys.has(student.parentKey)) {
      issues.push({
        code: "UNKNOWN_PARENT",
        severity: "error",
        message: `${student.key} references missing parent ${student.parentKey}.`,
      });
    }
  }
  const studentKeys = new Set(EDUMATCH_STUDENTS.map((student) => student.key));
  for (const brief of EDUMATCH_BRIEFS) {
    if (!studentKeys.has(brief.studentKey)) {
      issues.push({
        code: "UNKNOWN_BRIEF_STUDENT",
        severity: "error",
        message: `${brief.key} references missing student ${brief.studentKey}.`,
      });
    }
  }
  for (const [briefKey, matches] of Object.entries(EDUMATCH_MATCH_PLAN)) {
    const brief = EDUMATCH_BRIEFS.find((item) => item.key === briefKey);
    if (!brief || matches.length > 5) {
      issues.push({
        code: "INVALID_MATCH_PLAN",
        severity: "error",
        message: `${briefKey} has no brief or exceeds the five-tutor limit.`,
      });
      continue;
    }
    const student = EDUMATCH_STUDENTS.find(
      (item) => item.key === brief.studentKey
    )!;
    const isMinor = dateOnly(student.dateOfBirth) > dateFromNow(-18 * 365.25);
    for (const match of matches) {
      const tutor = EDUMATCH_TUTORS.find((item) => item.key === match.tutor);
      if (
        !tutor ||
        tutor.verification !== "VERIFIED" ||
        !tutor.subjects.includes(brief.subject) ||
        (isMinor && !tutor.clearedForMinors) ||
        (brief.mode === "IN_PERSON" && tutor.onlineOnly)
      ) {
        issues.push({
          code: "INELIGIBLE_MATCH_CANDIDATE",
          severity: "error",
          message: `${match.tutor} does not pass the hard filters for ${briefKey}.`,
        });
      }
    }
  }
  for (const id of Object.values(EDUMATCH_CHAIN_IDS)) {
    if (!id.startsWith(EDUMATCH_ID_PREFIX)) {
      issues.push({
        code: "CHAIN_ID_NOT_PREFIXED",
        severity: "error",
        seedKey: KEY_SCENARIOS,
        message: `Scenario id "${id}" is outside ${EDUMATCH_ID_PREFIX}.`,
      });
    }
  }
  return issues;
}

async function upsertDemoUser(
  prisma: SeedPrismaClient,
  email: string,
  name: string,
  image?: string
) {
  return prisma.user.upsert({
    where: { email },
    update: {
      name,
      image: image ?? null,
      preferredLocale: "en",
      timezone: "Europe/Brussels",
    },
    create: {
      email,
      name,
      image: image ?? null,
      emailVerified: new Date(),
      preferredLocale: "en",
      timezone: "Europe/Brussels",
    },
  });
}

export async function applyParents(prisma: SeedPrismaClient) {
  const rows = [];
  for (const parent of EDUMATCH_PARENTS) {
    const user = await upsertDemoUser(prisma, parent.email, parent.name);
    await prisma.eduParentProfile.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    });
    rows.push({ user, ...parent });
  }
  return rows;
}

export async function applyStudents(
  prisma: SeedPrismaClient,
  knownUsers?: UserMap
) {
  const users = knownUsers ?? new Map<string, SeedUser>();
  const rows = [];
  for (const student of EDUMATCH_STUDENTS) {
    const user = await upsertDemoUser(
      prisma,
      student.email,
      student.name,
      student.avatar
    );
    users.set(student.key, user);
    const parentUserId = student.parentKey
      ? users.get(student.parentKey)?.id
      : undefined;
    const isMinor = dateOnly(student.dateOfBirth) > dateFromNow(-18 * 365.25);
    const shared = {
      gradeLevel: student.gradeLevel,
      subjectsOfInterest: student.subjects,
      preferredLanguage: student.preferredLanguage,
      dateOfBirth: dateOnly(student.dateOfBirth),
      isMinor,
      guardianName: student.parentKey
        ? (users.get(student.parentKey)?.name ?? "Demo guardian")
        : null,
      guardianEmail: student.parentKey
        ? (users.get(student.parentKey)?.email ?? null)
        : null,
      parentUserId: parentUserId ?? null,
      homeAddress: student.home
        ? { city: student.home.city, country: "BE" }
        : undefined,
      homeLat: student.home?.lat,
      homeLng: student.home?.lng,
    };
    await prisma.eduStudentProfile.upsert({
      where: { userId: user.id },
      update: shared,
      create: { userId: user.id, ...shared },
    });
    rows.push({ user, ...student });
  }
  return rows;
}

export async function applyTutors(
  prisma: SeedPrismaClient,
  knownUsers?: UserMap
) {
  const users = knownUsers ?? new Map<string, SeedUser>();
  const rows = [];
  for (const tutor of EDUMATCH_TUTORS) {
    const user = await upsertDemoUser(prisma, tutor.email, tutor.name);
    users.set(tutor.key, user);
    const verified = tutor.verification === "VERIFIED";
    const ratings = reviewRatings(tutor);
    const clarity = ratings.map((rating, index) =>
      Math.min(5, rating + (index % 2))
    );
    const reliability = ratings;
    const engagement = ratings.map((rating, index) =>
      Math.max(1, rating - (index % 3 === 0 ? 1 : 0))
    );
    const average = (values: number[]) =>
      values.length
        ? Math.round(
            (values.reduce((sum, value) => sum + value, 0) / values.length) * 10
          ) / 10
        : null;
    const shared = {
      bio: `${tutor.name} is a synthetic EduMatch presentation tutor specialising in ${tutor.subjects.join(" and ")}.`,
      subjectsTaught: tutor.subjects,
      levelsTaught: tutor.levels,
      languagesTaught: tutor.languages,
      hourlyRateCents: tutor.hourlyRateCents,
      onlineOnly: tutor.onlineOnly,
      serviceRadiusKm: tutor.serviceRadiusKm,
      homeAddress: tutor.home
        ? {
            city: tutor.home.city,
            country: tutor.home.city === "Luxembourg" ? "LU" : "BE",
          }
        : undefined,
      homeLat: tutor.home?.lat,
      homeLng: tutor.home?.lng,
      stripeAccountId:
        tutor.stripeState === "NOT_STARTED"
          ? null
          : `acct_seed_edumatch_${tutor.key.toLowerCase()}`,
      payoutEnabled: tutor.stripeState === "ENABLED",
      verifiedAt: verified ? dateFromNow(-120) : null,
      clearedForMinorsAt: tutor.clearedForMinors ? dateFromNow(-90) : null,
      ratingAvg: average(ratings) ?? 0,
      ratingCount: ratings.length,
      clarityAvg: average(clarity),
      reliabilityAvg: average(reliability),
      engagementAvg: average(engagement),
      aspectedCount: ratings.length,
      qualifications: [`Synthetic credential in ${tutor.subjects[0]}`],
      teachingStyle: tutor.teachingStyle,
      weeklyAvailability: [
        { day: "MON", from: "16:00", to: "20:00" },
        { day: "SAT", from: "09:00", to: "13:00" },
      ],
      medianResponseMinutes: tutor.responseMinutes,
      invitesReceived: tutor.ratingCount + (tutor.ratingCount ? 3 : 1),
      proposalsSent: tutor.ratingCount,
      lastMatchedAt: tutor.ratingCount ? dateFromNow(-7) : dateFromNow(-60),
    };
    await prisma.eduTutorProfile.upsert({
      where: { userId: user.id },
      update: shared,
      create: { userId: user.id, ...shared },
    });
    await prisma.eduWallet.upsert({
      where: { tutorId: user.id },
      update: {
        balanceCents: tutor.wallet.balanceCents,
        pendingCents: tutor.wallet.pendingCents,
        lastPayoutAt: tutor.wallet.lastPayoutDaysAgo
          ? dateFromNow(-tutor.wallet.lastPayoutDaysAgo)
          : null,
      },
      create: {
        tutorId: user.id,
        balanceCents: tutor.wallet.balanceCents,
        pendingCents: tutor.wallet.pendingCents,
        lastPayoutAt: tutor.wallet.lastPayoutDaysAgo
          ? dateFromNow(-tutor.wallet.lastPayoutDaysAgo)
          : null,
      },
    });
    rows.push({ user, ...tutor });
  }
  return rows;
}

export async function applyAdmins(
  prisma: SeedPrismaClient,
  knownUsers?: UserMap
) {
  const users = knownUsers ?? new Map<string, SeedUser>();
  const role = await prisma.role.findUnique({ where: { name: "admin" } });
  if (!role)
    throw new Error(
      "The platform foundation admin role must be seeded before EduMatch presentation admins."
    );
  const rows = [];
  for (const admin of EDUMATCH_ADMINS) {
    const user = await upsertDemoUser(prisma, admin.email, admin.name);
    users.set(admin.key, user);
    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: { assignedBy: EDUMATCH_ID_PREFIX },
      create: {
        userId: user.id,
        roleId: role.id,
        assignedBy: EDUMATCH_ID_PREFIX,
      },
    });
    rows.push({ user, ...admin });
  }
  return rows;
}

function inquiryStatus(brief: DemoBrief) {
  if (brief.studentKey === "S18") return "REFUSED";
  if (brief.status === "ARCHIVED") return "CLOSED";
  if (brief.status === "MATCHED") return "TUTOR_REQUESTED";
  if (brief.status === "CONFIRMED") return "AI_RESPONDED";
  return "NEW";
}

async function upsertBriefSpine(
  prisma: SeedPrismaClient,
  brief: DemoBrief,
  users: UserMap
) {
  const student = users.get(brief.studentKey)!;
  const inquiryId = edumatchSeedId("inquiry", brief.key);
  const briefId = edumatchSeedId("brief", brief.key);
  const attachments = seedAttachments(brief.key);
  const refused = brief.studentKey === "S18";
  await prisma.eduInquiry.upsert({
    where: { id: inquiryId },
    update: {},
    create: {
      id: inquiryId,
      studentId: student.id,
      subject: brief.subject,
      gradeLevel: brief.educationalLevel,
      description: `${brief.objective} Current difficulty: ${brief.difficulty}`,
      attachments,
      aiSummary: refused
        ? "Request redirected toward original learning support."
        : `Synthetic summary: ${brief.topic}`,
      status: inquiryStatus(brief),
      moderationOutcome: refused ? "REFUSE" : "ALLOW",
      moderationCategory: refused ? "CHEATING" : "NONE",
      moderationReason: refused
        ? "Requested work that would bypass learning and assessment integrity."
        : null,
    },
  });
  await prisma.eduAiResponse.upsert({
    where: { id: edumatchSeedId("ai", brief.key) },
    update: {},
    create: {
      id: edumatchSeedId("ai", brief.key),
      inquiryId,
      modelUsed: "seed-fixture",
      promptVersion: "brief-v1-seed",
      explanation: refused
        ? "I cannot provide an answer key, but I can help you plan and understand the material step by step."
        : `Immediate help for ${brief.topic}: a concise explanation, worked example, and two practice prompts.`,
      studyPlan: {
        steps: [
          "Review the core idea",
          "Work one guided example",
          "Try two independent questions",
        ],
      },
      practiceProblems: {
        items: [
          `Practice ${brief.topic} with a supported example.`,
          "Explain the result in your own words.",
        ],
      },
      promptTokens: 240,
      completionTokens: 360,
      totalTokens: 600,
      tokenCostMicros: 950,
      latencyMs: 840,
      moderationOutcome: refused ? "REFUSE" : "ALLOW",
      moderationCategory: refused ? "CHEATING" : "NONE",
      moderationReason: refused ? "Academic-integrity redirection." : null,
    },
  });
  await prisma.eduLearningBrief.upsert({
    where: { id: briefId },
    update: {},
    create: {
      id: briefId,
      studentId: student.id,
      inquiryId,
      subject: brief.subject,
      topic: brief.topic,
      educationalLevel: brief.educationalLevel,
      schoolYear: brief.educationalLevel === "K12" ? "Demo school year" : null,
      learningObjective: brief.objective,
      currentUnderstanding: `The student can explain part of ${brief.topic} but needs support applying it.`,
      difficulties: [brief.difficulty],
      prerequisiteGaps:
        brief.triage === "NEEDS_DIAGNOSTIC"
          ? ["Reading strategy baseline"]
          : [],
      language: brief.language,
      mode: brief.mode,
      locationCity: brief.city,
      availability: [{ day: "WED", from: "17:00", to: "20:00" }],
      deadlineAt: dateFromNow(21),
      deadlineKind: "EXAM",
      accessibilityNeeds: brief.accessibilityNeeds,
      estimatedSessions: brief.triage === "SELF_STUDY" ? 0 : 3,
      sessionMinutes: 60,
      triageOutcome: brief.triage,
      triageRationale:
        brief.triage === "SELF_STUDY"
          ? "The immediate explanation and practice plan are sufficient."
          : brief.triage === "NEEDS_DIAGNOSTIC"
            ? "One more conversational diagnostic is needed."
            : "A tutor can accelerate progress on the named difficulty.",
      confidence: brief.status === "DRAFT" ? 0.55 : 0.92,
      attachments,
      status: brief.status,
      confirmedAt: brief.status === "DRAFT" ? null : dateFromNow(-10),
    },
  });

  const turns = [
    {
      suffix: "student",
      role: "STUDENT",
      kind: "MESSAGE",
      content: `${brief.objective} ${brief.difficulty}`,
      field: null,
    },
    {
      suffix: "help",
      role: "ASSISTANT",
      kind: "HELP",
      content: refused
        ? "Let us turn this into an original study plan."
        : `Here is a worked starting point for ${brief.topic}.`,
      field: null,
    },
    brief.status === "DRAFT"
      ? {
          suffix: "question",
          role: "ASSISTANT",
          kind: "QUESTION",
          content: "What outcome would make this session successful for you?",
          field: "learningObjective",
        }
      : {
          suffix: "summary",
          role: "ASSISTANT",
          kind: "SUMMARY",
          content: `Your Learning Brief for ${brief.topic} is ready to review.`,
          field: null,
        },
  ];
  for (const turn of turns) {
    await prisma.eduIntakeTurn.upsert({
      where: { id: edumatchSeedId("turn", `${brief.key}-${turn.suffix}`) },
      update: {},
      create: {
        id: edumatchSeedId("turn", `${brief.key}-${turn.suffix}`),
        briefId,
        role: turn.role,
        kind: turn.kind,
        content: turn.content,
        field: turn.field,
        attachments: turn.suffix === "student" ? attachments : undefined,
      },
    });
  }
}

function requestStatus(brief: DemoBrief) {
  if (brief.key === "S16") return "EXPIRED";
  if (brief.key === "S17") return "CANCELLED";
  if (["S01", "S02", "S09", "S11", "S12", "S15", "S25"].includes(brief.key))
    return "FULFILLED";
  return brief.status === "ARCHIVED" ? "FULFILLED" : "OPEN";
}

async function upsertMatchesAndProposals(
  prisma: SeedPrismaClient,
  users: UserMap
) {
  for (const brief of EDUMATCH_BRIEFS) {
    const matches = EDUMATCH_MATCH_PLAN[brief.key] ?? [];
    if (matches.length === 0 && brief.key !== "S17") continue;
    const requestId = edumatchSeedId("request", brief.key);
    await prisma.eduQuoteRequest.upsert({
      where: { id: requestId },
      update: {},
      create: {
        id: requestId,
        inquiryId: edumatchSeedId("inquiry", brief.key),
        studentId: users.get(brief.studentKey)!.id,
        briefId: edumatchSeedId("brief", brief.key),
        requestedAt: dateFromNow(-8),
        expiresAt: brief.key === "S16" ? dateFromNow(-1) : dateFromNow(2),
        status: requestStatus(brief),
      },
    });
    let rank = 1;
    for (const match of matches) {
      const tutor = EDUMATCH_TUTORS.find((item) => item.key === match.tutor)!;
      const tutorUser = users.get(match.tutor)!;
      const score = Math.max(0.55, 0.94 - (rank - 1) * 0.08);
      await prisma.eduMatchCandidate.upsert({
        where: {
          briefId_tutorId: {
            briefId: edumatchSeedId("brief", brief.key),
            tutorId: tutorUser.id,
          },
        },
        update: { rank, score, rotationBoost: Boolean(match.rotation) },
        create: {
          id: edumatchSeedId("candidate", `${brief.key}-${match.tutor}`),
          briefId: edumatchSeedId("brief", brief.key),
          quoteRequestId: requestId,
          tutorId: tutorUser.id,
          rank,
          score,
          breakdown: {
            subject: 0.25,
            level: 0.12,
            language: 0.12,
            mode: 0.1,
            schedule: 0.1,
            rating: tutor.ratingCount ? 0.1 : 0,
            responsiveness: tutor.responseMinutes ? 0.08 : 0,
            proximity: tutor.onlineOnly ? 0.03 : 0.08,
          },
          reasons: [
            "Teaches the requested subject",
            `Can teach in ${brief.language}`,
            match.rotation
              ? "Qualified newcomer rotation slot"
              : "Strong overall compatibility",
          ],
          rotationBoost: Boolean(match.rotation),
          invitedAt: dateFromNow(-7),
        },
      });
      rank += 1;
    }

    const proposalStatuses: Record<string, string[]> = {
      S01: ["ACCEPTED", "DECLINED"],
      S02: ["ACCEPTED", "PENDING"],
      S03: ["PENDING", "DRAFT", "PENDING"],
      S09: ["ACCEPTED", "PENDING", "DECLINED"],
      S11: ["ACCEPTED"],
      S12: ["ACCEPTED", "DECLINED"],
      S15: ["ACCEPTED", "DECLINED"],
      S16: ["EXPIRED", "EXPIRED"],
      S25: ["ACCEPTED", "DECLINED"],
    };
    const statuses = proposalStatuses[brief.key] ?? [];
    for (let index = 0; index < matches.length; index += 1) {
      const match = matches[index]!;
      const tutor = EDUMATCH_TUTORS.find((item) => item.key === match.tutor)!;
      const status = statuses[index] ?? "DRAFT";
      const sent = status !== "DRAFT";
      await prisma.eduQuote.upsert({
        where: { id: edumatchSeedId("quote", `${brief.key}-${match.tutor}`) },
        update: {},
        create: {
          id: edumatchSeedId("quote", `${brief.key}-${match.tutor}`),
          quoteRequestId: requestId,
          tutorId: users.get(match.tutor)!.id,
          hourlyRateCents: tutor.hourlyRateCents,
          estimatedHours: 3,
          totalCents: tutor.hourlyRateCents * 3,
          availabilitySlots: [
            {
              start: dateFromNow(3).toISOString(),
              end: dateFromNow(3, 1).toISOString(),
              mode: brief.mode === "EITHER" ? "ONLINE" : brief.mode,
            },
          ],
          notes: `Synthetic prepared proposal for ${brief.topic}.`,
          status,
          briefId: edumatchSeedId("brief", brief.key),
          sessionCount: 3,
          sessionMinutes: 60,
          mode:
            brief.mode === "EITHER"
              ? tutor.onlineOnly
                ? "ONLINE"
                : "IN_PERSON"
              : brief.mode,
          language: brief.language,
          earliestStartAt: dateFromNow(3 + index),
          planOutline: [
            {
              session: 1,
              focus: "Diagnose and explain",
              outcome: "Shared baseline",
            },
            {
              session: 2,
              focus: "Guided practice",
              outcome: "Independent method",
            },
            {
              session: 3,
              focus: "Review and transfer",
              outcome: "Next-step plan",
            },
          ],
          preparationNotes:
            "Bring the uploaded material and one attempted exercise.",
          cancellationPolicy: index % 2 ? "MODERATE" : "FLEXIBLE",
          aiDrafted: true,
          tutorAdjusted: index === 0,
          declineReason:
            status === "DECLINED" ? "Schedule does not fit this week." : null,
          sentAt: sent ? dateFromNow(-6, index) : null,
        },
      });
    }
  }
}

function reviewRatings(tutor: DemoTutor): number[] {
  if (!tutor.ratingCount) return [];
  const target = Math.round(tutor.ratingAvg * tutor.ratingCount);
  const values = Array<number>(tutor.ratingCount).fill(
    Math.floor(tutor.ratingAvg)
  );
  let current = values.reduce((sum, value) => sum + value, 0);
  for (
    let index = 0;
    current < target && index < values.length;
    index += 1, current += 1
  )
    values[index] = Math.min(5, values[index]! + 1);
  return values;
}

async function upsertCompletedHistory(
  prisma: SeedPrismaClient,
  users: UserMap
) {
  const existingBriefIds = new Set(
    (
      await prisma.eduLearningBrief.findMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
        select: { id: true },
      })
    ).map((brief) => brief.id)
  );
  let globalIndex = 0;
  for (const tutor of EDUMATCH_TUTORS) {
    const ratings = reviewRatings(tutor);
    for (let index = 0; index < ratings.length; index += 1) {
      globalIndex += 1;
      const specialStudent =
        tutor.key === "T01" && index === 0
          ? "S01"
          : tutor.key === "T03" && index < 3
            ? "S25"
            : EDUMATCH_STUDENTS[
                (globalIndex + index) % EDUMATCH_STUDENTS.length
              ]!.key;
      const student = users.get(specialStudent)!;
      const tutorUser = users.get(tutor.key)!;
      const key = `${tutor.key}-${String(index + 1).padStart(2, "0")}`;
      const inquiryId = edumatchSeedId("history-inquiry", key);
      const requestId = edumatchSeedId("history-request", key);
      const quoteId = edumatchSeedId("history-quote", key);
      const bookingId = edumatchSeedId("history-booking", key);
      const daysAgo =
        tutor.key === "T01" && index < 4 ? index * 7 + 1 : 30 + globalIndex * 3;
      const brief = EDUMATCH_BRIEFS.find(
        (item) => item.studentKey === specialStudent
      );
      const briefId = brief ? edumatchSeedId("brief", brief.key) : null;
      const linkedBriefId =
        briefId && existingBriefIds.has(briefId) ? briefId : null;
      await prisma.eduInquiry.upsert({
        where: { id: inquiryId },
        update: {},
        create: {
          id: inquiryId,
          studentId: student.id,
          subject: tutor.subjects[0]!,
          gradeLevel: tutor.levels[0]!,
          description: `Historical synthetic ${tutor.subjects[0]} lesson.`,
          status: "CLOSED",
          moderationOutcome: "ALLOW",
          moderationCategory: "NONE",
        },
      });
      await prisma.eduQuoteRequest.upsert({
        where: { id: requestId },
        update: {},
        create: {
          id: requestId,
          inquiryId,
          studentId: student.id,
          status: "FULFILLED",
          expiresAt: dateFromNow(-daysAgo + 2),
        },
      });
      await prisma.eduQuote.upsert({
        where: { id: quoteId },
        update: {},
        create: {
          id: quoteId,
          quoteRequestId: requestId,
          tutorId: tutorUser.id,
          hourlyRateCents: tutor.hourlyRateCents,
          estimatedHours: 1,
          totalCents: tutor.hourlyRateCents,
          status: "ACCEPTED",
          briefId: linkedBriefId,
          sessionCount: 1,
          sessionMinutes: 60,
          mode: tutor.onlineOnly
            ? "ONLINE"
            : index % 2
              ? "ONLINE"
              : "IN_PERSON",
          language: tutor.languages[0],
          sentAt: dateFromNow(-daysAgo - 2),
        },
      });
      await prisma.eduBooking.upsert({
        where: { id: bookingId },
        update: {},
        create: {
          id: bookingId,
          quoteId,
          studentId: student.id,
          tutorId: tutorUser.id,
          payerId: student.id,
          scheduledAt: dateFromNow(-daysAgo),
          durationMinutes: 60,
          mode: tutor.onlineOnly
            ? "ONLINE"
            : index % 2
              ? "ONLINE"
              : "IN_PERSON",
          meetingUrl:
            tutor.onlineOnly || index % 2
              ? `https://meet.edumatch.demo/${key}`
              : null,
          status: "COMPLETED",
          completedAt: dateFromNow(-daysAgo, 1),
        },
      });
      await prisma.eduSessionRecord.upsert({
        where: { bookingId },
        update: {},
        create: {
          id: edumatchSeedId("session", key),
          bookingId,
          briefId: linkedBriefId,
          tutorId: tutorUser.id,
          studentId: student.id,
          attendance: "ATTENDED",
          topicsCovered: [tutor.subjects[0]!, `Applied ${tutor.subjects[0]}`],
          tutorNotes: "Synthetic private tutor note.",
          studentSummary:
            "We identified the main method and practised it independently.",
          homework: "Complete two similar exercises and explain each step.",
          nextStep: "Review the homework and move to a mixed example.",
          resources: [
            {
              label: "Demo practice sheet",
              url: "https://example.invalid/edumatch/practice",
            },
          ],
          goalProgress: Math.min(95, 55 + index * 5),
          openConcerns: index < 2 ? ["Confidence under time pressure"] : [],
          createdAt: dateFromNow(-daysAgo),
        },
      });
      const rating = ratings[index]!;
      await prisma.eduReview.upsert({
        where: { bookingId },
        update: {},
        create: {
          id: edumatchSeedId("review", key),
          bookingId,
          studentId: student.id,
          tutorId: tutorUser.id,
          rating,
          comment:
            index === 0
              ? "Clear explanation, reliable preparation, and useful practice."
              : "Helpful synthetic verified review.",
          clarity: Math.min(5, rating + (index % 2)),
          reliability: rating,
          engagement: Math.max(1, rating - (index % 3 === 0 ? 1 : 0)),
          createdAt: dateFromNow(-daysAgo),
        },
      });
      const fee = Math.round(tutor.hourlyRateCents * 0.15);
      await prisma.eduTransaction.upsert({
        where: { id: edumatchSeedId("transaction", `${key}-charge`) },
        update: {},
        create: {
          id: edumatchSeedId("transaction", `${key}-charge`),
          bookingId,
          tutorId: tutorUser.id,
          type: "CHARGE",
          grossCents: tutor.hourlyRateCents,
          platformFeeCents: fee,
          netCents: tutor.hourlyRateCents - fee,
          createdAt: dateFromNow(-daysAgo),
        },
      });
    }
  }
}

async function upsertForegroundBookings(
  prisma: SeedPrismaClient,
  users: UserMap
) {
  const rows = [
    { key: "S02", tutor: "T01", status: "SCHEDULED", days: 3, payer: "P01" },
    { key: "S09", tutor: "T01", status: "SCHEDULED", days: 5, payer: "S09" },
    { key: "S11", tutor: "T04", status: "SCHEDULED", days: 7, payer: "S11" },
    { key: "S12", tutor: "T03", status: "DISPUTED", days: -5, payer: "S12" },
  ];
  for (const row of rows) {
    const quoteId = edumatchSeedId("quote", `${row.key}-${row.tutor}`);
    const bookingId = edumatchSeedId("booking", row.key);
    await prisma.eduBooking.upsert({
      where: { id: bookingId },
      update: { status: row.status },
      create: {
        id: bookingId,
        quoteId,
        studentId: users.get(row.key)!.id,
        tutorId: users.get(row.tutor)!.id,
        payerId: users.get(row.payer)!.id,
        scheduledAt: dateFromNow(row.days),
        durationMinutes: 60,
        mode: row.key === "S02" ? "IN_PERSON" : "ONLINE",
        meetingUrl:
          row.key === "S02"
            ? null
            : `https://meet.edumatch.demo/${row.key.toLowerCase()}`,
        status: row.status,
        completedAt:
          row.status === "DISPUTED" ? dateFromNow(row.days, 1) : null,
      },
    });
    if (row.status === "DISPUTED") {
      await prisma.eduSessionRecord.upsert({
        where: { bookingId },
        update: {},
        create: {
          id: edumatchSeedId("session", row.key),
          bookingId,
          briefId: edumatchSeedId("brief", row.key),
          tutorId: users.get(row.tutor)!.id,
          studentId: users.get(row.key)!.id,
          attendance: "PARTIAL",
          topicsCovered: ["Bayesian priors"],
          studentSummary: "The session ended early and needs support review.",
          goalProgress: 35,
          openConcerns: ["Expectations about preparation"],
        },
      });
    }
  }

  // A cancelled legacy booking and a no-show refund-record example.
  for (const example of [
    { key: "S10", tutor: "T02", status: "CANCELLED", attendance: null },
    { key: "S14", tutor: "T07", status: "CANCELLED", attendance: "NO_SHOW" },
  ]) {
    const inquiryId = edumatchSeedId("example-inquiry", example.key);
    const requestId = edumatchSeedId("example-request", example.key);
    const quoteId = edumatchSeedId("example-quote", example.key);
    const bookingId = edumatchSeedId("booking", example.key);
    await prisma.eduInquiry.upsert({
      where: { id: inquiryId },
      update: {},
      create: {
        id: inquiryId,
        studentId: users.get(example.key)!.id,
        subject: example.key === "S10" ? "Chemistry" : "German",
        gradeLevel: "K12",
        description:
          "Synthetic support request used to demonstrate cancellation handling.",
        status: "CLOSED",
        moderationOutcome: "ALLOW",
        moderationCategory: "NONE",
      },
    });
    await prisma.eduQuoteRequest.upsert({
      where: { id: requestId },
      update: {},
      create: {
        id: requestId,
        inquiryId,
        studentId: users.get(example.key)!.id,
        expiresAt: dateFromNow(-8),
        status: "FULFILLED",
      },
    });
    await prisma.eduQuote.upsert({
      where: { id: quoteId },
      update: {},
      create: {
        id: quoteId,
        quoteRequestId: requestId,
        tutorId: users.get(example.tutor)!.id,
        hourlyRateCents: 3800,
        estimatedHours: 1,
        totalCents: 3800,
        status: "ACCEPTED",
      },
    });
    await prisma.eduBooking.upsert({
      where: { id: bookingId },
      update: {},
      create: {
        id: bookingId,
        quoteId,
        studentId: users.get(example.key)!.id,
        tutorId: users.get(example.tutor)!.id,
        payerId: users.get(example.key === "S14" ? "P05" : example.key)!.id,
        scheduledAt: dateFromNow(-10),
        durationMinutes: 60,
        mode: "ONLINE",
        status: example.status,
        cancelledAt: dateFromNow(-9),
        cancellationReason:
          example.key === "S14"
            ? "Admin resolved the no-show dispute with a recorded refund."
            : "Student schedule changed.",
      },
    });
    if (example.attendance) {
      await prisma.eduSessionRecord.upsert({
        where: { bookingId },
        update: {},
        create: {
          id: edumatchSeedId("session", example.key),
          bookingId,
          tutorId: users.get(example.tutor)!.id,
          studentId: users.get(example.key)!.id,
          attendance: example.attendance,
          topicsCovered: [],
          studentSummary: "No lesson content was delivered.",
          goalProgress: 0,
          openConcerns: ["Reschedule required"],
        },
      });
      await prisma.eduTransaction.upsert({
        where: { id: edumatchSeedId("transaction", `${example.key}-refund`) },
        update: {},
        create: {
          id: edumatchSeedId("transaction", `${example.key}-refund`),
          bookingId,
          tutorId: users.get(example.tutor)!.id,
          type: "REFUND",
          grossCents: -3800,
          platformFeeCents: 0,
          netCents: -3800,
        },
      });
    }
  }
}

async function upsertLegacyCases(prisma: SeedPrismaClient, users: UserMap) {
  await prisma.eduInquiry.upsert({
    where: { id: edumatchSeedId("legacy-inquiry", "S08") },
    update: {},
    create: {
      id: edumatchSeedId("legacy-inquiry", "S08"),
      studentId: users.get("S08")!.id,
      subject: "Physics",
      gradeLevel: "UNDERGRAD",
      description: "Explain angular momentum using a worked example.",
      status: "AI_RESPONDED",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });
  await prisma.eduAiResponse.upsert({
    where: { id: edumatchSeedId("legacy-ai", "S08") },
    update: {},
    create: {
      id: edumatchSeedId("legacy-ai", "S08"),
      inquiryId: edumatchSeedId("legacy-inquiry", "S08"),
      modelUsed: "seed-fixture",
      promptVersion: "legacy-v1-seed",
      explanation:
        "A synthetic worked example connecting torque and angular momentum.",
      promptTokens: 180,
      completionTokens: 260,
      totalTokens: 440,
      latencyMs: 620,
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });

  const inquiryId = edumatchSeedId("legacy-inquiry", "S20");
  const requestId = edumatchSeedId("legacy-request", "S20");
  const quoteId = edumatchSeedId("legacy-quote", "S20-T06");
  const bookingId = edumatchSeedId("legacy-booking", "S20");
  await prisma.eduInquiry.upsert({
    where: { id: inquiryId },
    update: {},
    create: {
      id: inquiryId,
      studentId: users.get("S20")!.id,
      subject: "Accounting",
      gradeLevel: "UNDERGRAD",
      description: "Prepare for a management-accounting assessment.",
      status: "BOOKED",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });
  await prisma.eduAiResponse.upsert({
    where: { id: edumatchSeedId("legacy-ai", "S20") },
    update: {},
    create: {
      id: edumatchSeedId("legacy-ai", "S20"),
      inquiryId,
      modelUsed: "seed-fixture",
      promptVersion: "legacy-v1-seed",
      explanation:
        "Synthetic study plan for contribution margins and break-even analysis.",
      moderationOutcome: "ALLOW",
      moderationCategory: "NONE",
    },
  });
  await prisma.eduQuoteRequest.upsert({
    where: { id: requestId },
    update: {},
    create: {
      id: requestId,
      inquiryId,
      studentId: users.get("S20")!.id,
      expiresAt: dateFromNow(4),
      status: "FULFILLED",
    },
  });
  await prisma.eduQuote.upsert({
    where: { id: quoteId },
    update: {},
    create: {
      id: quoteId,
      quoteRequestId: requestId,
      tutorId: users.get("T06")!.id,
      hourlyRateCents: 4800,
      estimatedHours: 2,
      totalCents: 9600,
      status: "ACCEPTED",
      notes: "Two-session legacy quote presentation fixture.",
      pdfUrl: "seed://edumatch/quotes/s20-accounting.pdf",
      sentAt: dateFromNow(-2),
    },
  });
  await prisma.eduBooking.upsert({
    where: { id: bookingId },
    update: {},
    create: {
      id: bookingId,
      quoteId,
      studentId: users.get("S20")!.id,
      tutorId: users.get("T06")!.id,
      payerId: users.get("S20")!.id,
      scheduledAt: dateFromNow(4),
      durationMinutes: 60,
      mode: "ONLINE",
      meetingUrl: "https://meet.edumatch.demo/s20",
      stripePaymentIntentId: "pi_seed_edumatch_s20",
      status: "SCHEDULED",
    },
  });
  await prisma.eduTransaction.upsert({
    where: { id: edumatchSeedId("legacy-transaction", "S20-charge") },
    update: {},
    create: {
      id: edumatchSeedId("legacy-transaction", "S20-charge"),
      bookingId,
      tutorId: users.get("T06")!.id,
      type: "CHARGE",
      grossCents: 9600,
      platformFeeCents: 1440,
      netCents: 8160,
    },
  });
}

async function upsertTrustAndOperations(
  prisma: SeedPrismaClient,
  users: UserMap
) {
  const reviewer = users.get("A02")!;
  for (const tutor of EDUMATCH_TUTORS) {
    const tutorUser = users.get(tutor.key)!;
    const status = tutor.verification;
    await prisma.eduTutorVerification.upsert({
      where: { id: edumatchSeedId("verification", tutor.key) },
      update: { status },
      create: {
        id: edumatchSeedId("verification", tutor.key),
        tutorId: tutorUser.id,
        reviewerId: status === "PENDING" ? null : reviewer.id,
        status,
        checklist: {
          identityVerified: status === "VERIFIED",
          credentialsVerified: status === "VERIFIED",
          backgroundCheck: tutor.clearedForMinors,
          profileComplete: status !== "REJECTED",
        },
        adminNotes:
          status === "REJECTED"
            ? "Synthetic credentials could not be verified."
            : status === "NEEDS_CHANGES"
              ? "Please provide a clearer credential scan."
              : null,
        tutorMessage:
          status === "NEEDS_CHANGES"
            ? "Please upload a clearer credential scan and confirm your teaching history."
            : null,
        resolvedAt: status === "PENDING" ? null : dateFromNow(-5),
      },
    });
  }

  const t14 = users.get("T14")!;
  await prisma.eduVerificationMessage.upsert({
    where: { id: edumatchSeedId("verification-message", "T14-admin") },
    update: {},
    create: {
      id: edumatchSeedId("verification-message", "T14-admin"),
      tutorId: t14.id,
      senderId: reviewer.id,
      senderRole: "ADMIN",
      body: "Please upload a clearer copy of your teaching credential.",
      attachments: [
        {
          key: "seed/verification/t14/checklist.pdf",
          mime: "application/pdf",
          filename: "review-checklist.pdf",
          sizeBytes: 42_000,
        },
      ],
      reactions: { question: [t14.id] },
      readAt: dateFromNow(-3),
    },
  });
  await prisma.eduVerificationMessage.upsert({
    where: { id: edumatchSeedId("verification-message", "T14-tutor") },
    update: {},
    create: {
      id: edumatchSeedId("verification-message", "T14-tutor"),
      tutorId: t14.id,
      senderId: t14.id,
      senderRole: "TUTOR",
      body: "I uploaded a new scan and added the requested teaching-history note.",
      attachments: [
        {
          key: "seed/verification/t14/credential.pdf",
          mime: "application/pdf",
          filename: "credential-demo.pdf",
          sizeBytes: 128_000,
        },
      ],
      reactions: { eyes: [reviewer.id] },
      readAt: null,
    },
  });

  for (const key of [
    "S01",
    "S02",
    "S03",
    "S12",
    "S18",
    "S27",
    "T01",
    "T13",
    "T14",
  ]) {
    const user = users.get(key)!;
    const types =
      key === "S18"
        ? ["AI_RESPONSE_READY"]
        : key.startsWith("T")
          ? ["INQUIRY_RECEIVED", "BOOKING_CONFIRMED"]
          : ["AI_RESPONSE_READY", "QUOTE_RECEIVED", "BOOKING_CONFIRMED"];
    for (let index = 0; index < types.length; index += 1) {
      await prisma.eduNotification.upsert({
        where: { id: edumatchSeedId("notification", `${key}-${index}`) },
        update: {},
        create: {
          id: edumatchSeedId("notification", `${key}-${index}`),
          userId: user.id,
          type: types[index]!,
          payload: {
            synthetic: true,
            briefId: EDUMATCH_BRIEFS.some((brief) => brief.key === key)
              ? edumatchSeedId("brief", key)
              : undefined,
          },
          readAt: index === 0 ? null : dateFromNow(-1),
          sentAt: dateFromNow(-2 + index),
        },
      });
    }
  }
  await prisma.eduNotificationPreference.upsert({
    where: { userId: users.get("S27")!.id },
    update: { emailAiResponseReady: false },
    create: { userId: users.get("S27")!.id, emailAiResponseReady: false },
  });

  for (const extra of [
    { key: "S10-cancelled", user: "S10", type: "BOOKING_CANCELLED" },
    { key: "S12-disputed", user: "S12", type: "BOOKING_DISPUTED" },
    { key: "T11-payout", user: "T11", type: "PAYOUT_SENT" },
  ]) {
    await prisma.eduNotification.upsert({
      where: { id: edumatchSeedId("notification", extra.key) },
      update: {},
      create: {
        id: edumatchSeedId("notification", extra.key),
        userId: users.get(extra.user)!.id,
        type: extra.type,
        payload: { synthetic: true },
        sentAt: dateFromNow(-1),
      },
    });
  }

  for (const ledger of [
    {
      key: "T01-01-fee",
      booking: "T01-01",
      tutor: "T01",
      type: "PLATFORM_FEE",
      gross: 0,
      fee: 675,
      net: -675,
    },
    {
      key: "T03-01-payout",
      booking: "T03-01",
      tutor: "T03",
      type: "PAYOUT",
      gross: 0,
      fee: 0,
      net: -4420,
    },
    {
      key: "T11-01-payout",
      booking: "T11-01",
      tutor: "T11",
      type: "PAYOUT",
      gross: 0,
      fee: 0,
      net: -5100,
    },
  ]) {
    await prisma.eduTransaction.upsert({
      where: { id: edumatchSeedId("transaction", ledger.key) },
      update: {},
      create: {
        id: edumatchSeedId("transaction", ledger.key),
        bookingId: edumatchSeedId("history-booking", ledger.booking),
        tutorId: users.get(ledger.tutor)!.id,
        type: ledger.type,
        grossCents: ledger.gross,
        platformFeeCents: ledger.fee,
        netCents: ledger.net,
      },
    });
  }
  await prisma.eduNotificationPreference.upsert({
    where: { userId: users.get("T13")!.id },
    update: { emailInquiryReceived: false, emailQuoteReceived: false },
    create: {
      userId: users.get("T13")!.id,
      emailInquiryReceived: false,
      emailQuoteReceived: false,
    },
  });

  const audits = [
    {
      key: "S18-refused",
      actor: "S18",
      role: "STUDENT",
      action: "AI_RESPONSE_REFUSED",
      entity: "EduInquiry",
      entityId: edumatchSeedId("inquiry", "S18"),
      prev: "NEW",
      next: "REFUSED",
    },
    {
      key: "S12-disputed",
      actor: "S12",
      role: "STUDENT",
      action: "BOOKING_DISPUTED",
      entity: "EduBooking",
      entityId: edumatchSeedId("booking", "S12"),
      prev: "COMPLETED",
      next: "DISPUTED",
    },
    {
      key: "S12-response",
      actor: "T03",
      role: "TUTOR",
      action: "DISPUTE_RESPONSE_ADDED",
      entity: "EduBooking",
      entityId: edumatchSeedId("booking", "S12"),
      prev: "DISPUTED",
      next: "DISPUTED",
    },
    {
      key: "S14-refund",
      actor: "A03",
      role: "ADMIN",
      action: "DISPUTE_RESOLVED",
      entity: "EduBooking",
      entityId: edumatchSeedId("booking", "S14"),
      prev: "DISPUTED",
      next: "CANCELLED",
    },
    {
      key: "T14-needs-changes",
      actor: "A02",
      role: "ADMIN",
      action: "TUTOR_VERIFICATION_UPDATED",
      entity: "EduTutorProfile",
      entityId: users.get("T14")!.id,
      prev: "PENDING",
      next: "NEEDS_CHANGES",
    },
    {
      key: "S12-request-info",
      actor: "A03",
      role: "ADMIN",
      action: "DISPUTE_INFO_REQUESTED",
      entity: "EduBooking",
      entityId: edumatchSeedId("booking", "S12"),
      prev: "DISPUTED",
      next: "DISPUTED",
    },
    {
      key: "T02-no-refund",
      actor: "A03",
      role: "ADMIN",
      action: "DISPUTE_RESOLVED",
      entity: "EduBooking",
      entityId: edumatchSeedId("history-booking", "T02-01"),
      prev: "DISPUTED",
      next: "COMPLETED",
    },
  ];
  for (const audit of audits) {
    await prisma.eduAuditEvent.upsert({
      where: { id: edumatchSeedId("audit", audit.key) },
      update: {},
      create: {
        id: edumatchSeedId("audit", audit.key),
        actorId: users.get(audit.actor)!.id,
        actorRole: audit.role,
        action: audit.action,
        entity: audit.entity,
        entityId: audit.entityId,
        prevState: audit.prev,
        nextState: audit.next,
        reason: "Synthetic presentation scenario.",
        metadata: { seed: true },
      },
    });
  }
}

export async function applyBookingChain(
  prisma: SeedPrismaClient,
  _studentId?: string,
  _tutorId?: string
) {
  const users = await loadUserMap(prisma);
  await upsertCompletedHistory(prisma, users);
  return {
    inquiry: await prisma.eduInquiry.findUnique({
      where: { id: EDUMATCH_CHAIN_IDS.inquiry },
    }),
    quoteRequest: await prisma.eduQuoteRequest.findUnique({
      where: { id: EDUMATCH_CHAIN_IDS.quoteRequest },
    }),
    quote: await prisma.eduQuote.findUnique({
      where: { id: edumatchSeedId("quote", "S01-T01") },
    }),
    booking: await prisma.eduBooking.findUnique({
      where: { id: edumatchSeedId("history-booking", "T01-01") },
    }),
  };
}

async function loadUserMap(prisma: SeedPrismaClient): Promise<UserMap> {
  const users = await prisma.user.findMany({
    where: { email: { in: EDUMATCH_DEMO_EMAILS } },
  });
  const emailToUser = new Map(users.map((user) => [user.email, user]));
  const result: UserMap = new Map();
  for (const member of [
    ...EDUMATCH_PARENTS,
    ...EDUMATCH_STUDENTS,
    ...EDUMATCH_TUTORS,
    ...EDUMATCH_ADMINS,
  ]) {
    const user = emailToUser.get(member.email);
    if (user) result.set(member.key, user);
  }
  return result;
}

export async function seedEdumatch(prisma: SeedPrismaClient) {
  const users: UserMap = new Map();
  const parents = await applyParents(prisma);
  for (const row of parents) users.set(row.key, row.user);
  const students = await applyStudents(prisma, users);
  const tutors = await applyTutors(prisma, users);
  const admins = await applyAdmins(prisma, users);
  for (const row of [...students, ...tutors, ...admins])
    users.set(row.key, row.user);

  for (const brief of EDUMATCH_BRIEFS)
    await upsertBriefSpine(prisma, brief, users);
  await upsertMatchesAndProposals(prisma, users);
  await upsertCompletedHistory(prisma, users);
  await upsertForegroundBookings(prisma, users);
  await upsertLegacyCases(prisma, users);
  await upsertTrustAndOperations(prisma, users);

  return {
    students: students.length,
    tutors: tutors.length,
    parents: parents.length,
    admins: admins.length,
    members: users.size,
    briefs: EDUMATCH_BRIEFS.length,
  };
}

interface EdumatchSnapshot {
  entities: SeedEntityCounts[];
  seedOwnedCount: number;
  missingCount: number;
  driftedCount: number;
  orphanedCount: number;
  presentEmails: string[];
  orphanEmails: string[];
}

async function snapshot(prisma: SeedPrismaClient): Promise<EdumatchSnapshot> {
  const demoUsers = await prisma.user.findMany({
    where: { email: { endsWith: EDUMATCH_DEMO_EMAIL_DOMAIN } },
    select: {
      email: true,
      name: true,
      eduStudentProfile: { select: { userId: true } },
      eduTutorProfile: {
        select: { userId: true, hourlyRateCents: true, onlineOnly: true },
      },
      eduParentProfile: { select: { userId: true } },
      userRoles: { select: { role: { select: { name: true } } } },
    },
  });
  const byEmail = new Map(demoUsers.map((user) => [user.email, user]));
  const countAndDrift = <T extends { email: string; name: string }>(
    definitions: T[],
    present: (row: (typeof demoUsers)[number]) => boolean,
    drift?: (definition: T, row: (typeof demoUsers)[number]) => boolean
  ) => {
    let count = 0;
    let drifted = 0;
    for (const definition of definitions) {
      const row = byEmail.get(definition.email);
      if (!row || !present(row)) continue;
      count += 1;
      if (row.name !== definition.name || drift?.(definition, row))
        drifted += 1;
    }
    return { count, drifted };
  };
  const students = countAndDrift(EDUMATCH_STUDENTS, (row) =>
    Boolean(row.eduStudentProfile)
  );
  const tutors = countAndDrift(
    EDUMATCH_TUTORS,
    (row) => Boolean(row.eduTutorProfile),
    (definition, row) =>
      row.eduTutorProfile!.hourlyRateCents !==
        (definition as DemoTutor).hourlyRateCents ||
      row.eduTutorProfile!.onlineOnly !== (definition as DemoTutor).onlineOnly
  );
  const parents = countAndDrift(EDUMATCH_PARENTS, (row) =>
    Boolean(row.eduParentProfile)
  );
  const admins = countAndDrift(EDUMATCH_ADMINS, (row) =>
    row.userRoles.some((item) => item.role.name === "admin")
  );
  const scenarioCounts = await Promise.all([
    prisma.eduInquiry.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduAiResponse.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduLearningBrief.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduIntakeTurn.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduQuoteRequest.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduMatchCandidate.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduQuote.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduBooking.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduSessionRecord.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduReview.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduTransaction.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduNotification.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduTutorVerification.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduVerificationMessage.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
    prisma.eduAuditEvent.count({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    }),
  ]);
  const scenarioPresent = scenarioCounts.reduce((sum, count) => sum + count, 0);
  const matchCount = Object.values(EDUMATCH_MATCH_PLAN).reduce(
    (sum, matches) => sum + matches.length,
    0
  );
  const requestCount = Object.keys(EDUMATCH_MATCH_PLAN).length + 1;
  const reviewCount = EDUMATCH_TUTORS.reduce(
    (sum, tutor) => sum + tutor.ratingCount,
    0
  );
  const scenarioExpected =
    EDUMATCH_BRIEFS.length * 6 +
    requestCount +
    matchCount * 2 +
    reviewCount * 7 +
    5 +
    10 +
    EDUMATCH_TUTORS.length +
    2 +
    25 +
    7 +
    8 +
    3;
  const known = new Set(EDUMATCH_DEMO_EMAILS);
  const orphanEmails = demoUsers
    .map((user) => user.email)
    .filter((email) => !known.has(email));
  const entities: SeedEntityCounts[] = [
    {
      entity: "Demo students",
      seedKey: KEY_STUDENTS,
      present: students.count,
      missing: EDUMATCH_STUDENTS.length - students.count,
      drifted: students.drifted,
      orphaned: 0,
    },
    {
      entity: "Demo tutors",
      seedKey: KEY_TUTORS,
      present: tutors.count,
      missing: EDUMATCH_TUTORS.length - tutors.count,
      drifted: tutors.drifted,
      orphaned: 0,
    },
    {
      entity: "Demo parents",
      seedKey: KEY_PARENTS,
      present: parents.count,
      missing: EDUMATCH_PARENTS.length - parents.count,
      drifted: parents.drifted,
      orphaned: 0,
    },
    {
      entity: "Demo admins",
      seedKey: KEY_ADMINS,
      present: admins.count,
      missing: EDUMATCH_ADMINS.length - admins.count,
      drifted: admins.drifted,
      orphaned: 0,
    },
    {
      entity: "Presentation scenario spine",
      seedKey: KEY_SCENARIOS,
      present: scenarioPresent,
      missing: Math.max(0, scenarioExpected - scenarioPresent),
      drifted: 0,
      orphaned: orphanEmails.length,
    },
  ];
  return {
    entities,
    seedOwnedCount: entities.reduce((sum, entity) => sum + entity.present, 0),
    missingCount: entities.reduce((sum, entity) => sum + entity.missing, 0),
    driftedCount: entities.reduce((sum, entity) => sum + entity.drifted, 0),
    orphanedCount: orphanEmails.length,
    presentEmails: EDUMATCH_DEMO_EMAILS.filter((email) => byEmail.has(email)),
    orphanEmails,
  };
}

function healthOf(
  snap: Pick<
    EdumatchSnapshot,
    "missingCount" | "driftedCount" | "orphanedCount"
  >
) {
  if (snap.missingCount > 0) return "missing" as const;
  if (snap.driftedCount > 0) return "drifted" as const;
  if (snap.orphanedCount > 0) return "orphaned" as const;
  return "clean" as const;
}

async function userRetentionReasons(
  prisma: SeedPrismaClient,
  emails: string[]
) {
  const reasons = new Map<string, string>();
  if (!emails.length) return reasons;
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      email: true,
      _count: { select: { accounts: true, sessions: true } },
      userRoles: {
        select: { assignedBy: true, role: { select: { name: true } } },
      },
    },
  });
  for (const user of users) {
    if (user._count.accounts) {
      reasons.set(user.email, "has linked sign-in accounts");
      continue;
    }
    if (user._count.sessions) {
      reasons.set(user.email, "has active sessions");
      continue;
    }
    if (
      user.userRoles.some(
        (item) =>
          item.assignedBy !== EDUMATCH_ID_PREFIX || item.role.name !== "admin"
      )
    ) {
      reasons.set(user.email, "has role assignments outside this seed");
      continue;
    }
    const [inquiries, bookings, briefs] = await Promise.all([
      prisma.eduInquiry.count({
        where: {
          studentId: user.id,
          id: { not: { startsWith: EDUMATCH_ID_PREFIX } },
        },
      }),
      prisma.eduBooking.count({
        where: {
          OR: [{ studentId: user.id }, { tutorId: user.id }],
          id: { not: { startsWith: EDUMATCH_ID_PREFIX } },
        },
      }),
      prisma.eduLearningBrief.count({
        where: {
          studentId: user.id,
          id: { not: { startsWith: EDUMATCH_ID_PREFIX } },
        },
      }),
    ]);
    if (inquiries || bookings || briefs)
      reasons.set(
        user.email,
        "owns EduMatch activity this seed did not create"
      );
  }
  return reasons;
}

export const edumatchProvider: SeedProvider = {
  id: PROVIDER_ID,
  appId: "edumatch",
  displayName: "EduMatch",
  description:
    "Fifty synthetic students, tutors, parents, and admins covering the presentation-ready learning journey.",
  databaseKind: "shared-prisma",
  availability: "configured",
  protected: false,
  definitionVersion: EDUMATCH_DEFINITION_VERSION,
  requiredEnv: requiredEnvVars("shared-prisma"),
  supports: {
    validate: true,
    status: true,
    seed: true,
    reconcile: true,
    remove: true,
  },
  manifest: [
    {
      seedKey: KEY_PARENTS,
      entity: "User + EduParentProfile",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      reconcilable: true,
      removable: true,
      protectedFields: ["password"],
      notes: `Reserved ${EDUMATCH_DEMO_EMAIL_DOMAIN} identities.`,
    },
    {
      seedKey: KEY_STUDENTS,
      entity: "User + EduStudentProfile",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      dependsOn: [KEY_PARENTS],
      reconcilable: true,
      removable: true,
      protectedFields: ["password"],
      notes: "Includes parent-managed and independent age-aware profiles.",
    },
    {
      seedKey: KEY_TUTORS,
      entity: "User + EduTutorProfile + EduWallet",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      reconcilable: true,
      removable: true,
      protectedFields: ["password"],
      userControlledFields: ["verifiedAt"],
      notes: "Exactly 10 hybrid and 5 online-only tutors.",
    },
    {
      seedKey: KEY_ADMINS,
      entity: "User + admin UserRole",
      identity: "unique-key",
      ownership: "seed-owned-shared",
      reconcilable: true,
      removable: true,
      protectedFields: ["password"],
      notes: "Requires the protected platform foundation roles.",
    },
    {
      seedKey: KEY_SCENARIOS,
      entity: "EduMatch presentation scenario graph",
      identity: "id",
      ownership: "seed-owned",
      dependsOn: [KEY_STUDENTS, KEY_TUTORS, KEY_PARENTS, KEY_ADMINS],
      reconcilable: true,
      removable: true,
      notes: `Every owned row id starts with ${EDUMATCH_ID_PREFIX}.`,
    },
  ],

  async validate(context): Promise<ValidationResult> {
    const startedAt = Date.now();
    const issues = validateEdumatchDefinitions();
    let connection: ValidationResult["connection"] = "ok";
    try {
      await withPrisma(context.connectionString, async (prisma) => {
        await prisma.$queryRaw`SELECT 1`;
        await prisma.eduLearningBrief.count();
      });
    } catch (error) {
      connection = "unreachable";
      const { code, message } = sanitizeError(error);
      issues.push({ code, severity: "error", message });
    }
    return {
      ok:
        connection === "ok" &&
        !issues.some((issue) => issue.severity === "error"),
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
                seedKey: KEY_SCENARIOS,
                message: `${snap.orphanEmails.length} undefined reserved-domain identities remain.`,
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
        const deletable = candidates.filter((email) => !retention.has(email));
        const scenarioRows =
          snap.entities.find((entity) => entity.seedKey === KEY_SCENARIOS)
            ?.present ?? 0;
        if (scenarioRows)
          changes.push({
            seedKey: KEY_SCENARIOS,
            entity: "Presentation scenario graph",
            action: "delete",
            count: scenarioRows,
          });
        if (deletable.length)
          changes.push({
            seedKey: KEY_STUDENTS,
            entity: "Demo identities",
            action: "delete",
            count: deletable.length,
          });
        for (const [email, reason] of retention)
          changes.push({
            seedKey: KEY_STUDENTS,
            entity: "Demo identity",
            action: "retain",
            count: 1,
            reason: `${email} retained — it ${reason}.`,
          });
        if (retention.size)
          warnings.push({
            code: "SHARED_USERS_RETAINED",
            severity: "warning",
            message: `${retention.size} demo identities will be retained because they hold non-seed activity.`,
          });
        return;
      }
      for (const entity of snap.entities) {
        if (entity.missing)
          changes.push({
            seedKey: entity.seedKey,
            entity: entity.entity,
            action: "insert",
            count: entity.missing,
          });
        if (entity.drifted)
          changes.push(
            operation === "reconcile"
              ? {
                  seedKey: entity.seedKey,
                  entity: entity.entity,
                  action: "update",
                  count: entity.drifted,
                }
              : {
                  seedKey: entity.seedKey,
                  entity: entity.entity,
                  action: "retain",
                  count: entity.drifted,
                  reason: "Use Reconcile to refresh drifted demo rows.",
                }
          );
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
      const outcome = await withPrisma(
        context.connectionString,
        async (prisma) => {
          if (approvedPlan.operation === "remove")
            return removeEdumatch(prisma, context);
          context.report?.({
            stage: "executing",
            message: "Seeding EduMatch presentation universe",
            percent: 25,
          });
          const applied = await seedEdumatch(prisma);
          context.report?.({
            stage: "verifying",
            message: "Re-inspecting presentation universe",
            percent: 90,
          });
          return {
            perEntity: [
              {
                seedKey: KEY_STUDENTS,
                entity: "Demo students",
                action: "update" as const,
                count: applied.students,
              },
              {
                seedKey: KEY_TUTORS,
                entity: "Demo tutors",
                action: "update" as const,
                count: applied.tutors,
              },
              {
                seedKey: KEY_PARENTS,
                entity: "Demo parents",
                action: "update" as const,
                count: applied.parents,
              },
              {
                seedKey: KEY_ADMINS,
                entity: "Demo admins",
                action: "update" as const,
                count: applied.admins,
              },
              {
                seedKey: KEY_SCENARIOS,
                entity: "Learning Briefs",
                action: "update" as const,
                count: applied.briefs,
              },
            ],
            deleted: 0,
            retained: 0,
            verified: await snapshot(prisma),
          };
        }
      );
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

function sumBy(changes: SeedPlanChange[], action: SeedPlanChange["action"]) {
  return changes
    .filter((change) => change.action === action)
    .reduce((sum, change) => sum + change.count, 0);
}

async function removeEdumatch(
  prisma: SeedPrismaClient,
  context: SeedProviderContext
) {
  const snap = await snapshot(prisma);
  const candidates = [...snap.presentEmails, ...snap.orphanEmails];
  const retention = await userRetentionReasons(prisma, candidates);
  const deletableEmails = candidates.filter((email) => !retention.has(email));
  context.report?.({
    stage: "executing",
    message: "Removing seed-owned EduMatch rows",
    percent: 35,
  });
  const users = await prisma.user.findMany({
    where: { email: { in: candidates } },
    select: { id: true },
  });
  const userIds = users.map((user) => user.id);
  const result = await prisma.$transaction(async (tx) => {
    const deleted = await Promise.all([
      tx.eduVerificationMessage.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
      tx.eduReview.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
      tx.eduSessionRecord.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
      tx.eduMessage.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
      tx.eduNotification.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
      tx.eduTransaction.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
      tx.eduAuditEvent.deleteMany({
        where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
      }),
    ]);
    const bookings = await tx.eduBooking.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const quotes = await tx.eduQuote.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const candidatesDeleted = await tx.eduMatchCandidate.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const requests = await tx.eduQuoteRequest.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const turns = await tx.eduIntakeTurn.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const briefs = await tx.eduLearningBrief.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const ai = await tx.eduAiResponse.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const inquiries = await tx.eduInquiry.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    const verifications = await tx.eduTutorVerification.deleteMany({
      where: { id: { startsWith: EDUMATCH_ID_PREFIX } },
    });
    await tx.eduNotificationPreference.deleteMany({
      where: { userId: { in: userIds } },
    });
    await tx.userRole.deleteMany({
      where: { userId: { in: userIds }, assignedBy: EDUMATCH_ID_PREFIX },
    });
    const identities = deletableEmails.length
      ? await tx.user.deleteMany({
          where: {
            email: {
              in: deletableEmails,
              endsWith: EDUMATCH_DEMO_EMAIL_DOMAIN,
            },
          },
        })
      : { count: 0 };
    return {
      rows: [
        ...deleted,
        bookings,
        quotes,
        candidatesDeleted,
        requests,
        turns,
        briefs,
        ai,
        inquiries,
        verifications,
      ].reduce((sum, item) => sum + item.count, 0),
      identities: identities.count,
    };
  });
  context.report?.({
    stage: "verifying",
    message: "Re-inspecting",
    percent: 90,
  });
  const verified = await snapshot(prisma);
  const perEntity: SeedPlanChange[] = [
    {
      seedKey: KEY_SCENARIOS,
      entity: "Presentation scenario rows",
      action: "delete",
      count: result.rows,
    },
    {
      seedKey: KEY_STUDENTS,
      entity: "Demo identities",
      action: "delete",
      count: result.identities,
    },
  ].filter((change) => change.count > 0) as SeedPlanChange[];
  for (const [email, reason] of retention)
    perEntity.push({
      seedKey: KEY_STUDENTS,
      entity: "Demo identity",
      action: "retain",
      count: 1,
      reason: `${email} retained — it ${reason}.`,
    });
  return {
    perEntity,
    deleted: result.rows + result.identities,
    retained: retention.size,
    verified,
  };
}

export { DEFINITION_CHECKSUM as EDUMATCH_DEFINITION_CHECKSUM };

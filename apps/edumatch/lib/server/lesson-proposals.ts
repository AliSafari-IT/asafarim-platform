/**
 * Prepared lesson proposals.
 *
 * The tutor side of the promise: instead of a vague lead ("student needs maths
 * help"), a tutor receives a confirmed Learning Brief *and* a proposal already
 * filled in from it — plan, session count, duration, their own hourly rate,
 * schedule, preparation notes, total price. When the prefill is right, the
 * tutor's job is one click. When it isn't, they adjust it.
 *
 * The invariant that makes this safe: **a prepared proposal is never sent on
 * the tutor's behalf.** Prefills are created as DRAFT and are invisible to the
 * student. Only `sendProposal` — which requires an explicit tutor action —
 * stamps `sentAt` and moves the quote to PENDING.
 */

import { prisma, type Prisma } from "@asafarim/db";
import { recordEduAuditEvent } from "./audit";
import { estimateSessions, type BriefFields } from "./learning-brief";
import { notifyStudentOfQuoteSubmitted } from "./notifications";

export class ProposalError extends Error {
  constructor(
    message: string,
    readonly code: "NOT_FOUND" | "INVALID_STATE" | "NOT_INVITED" = "INVALID_STATE",
  ) {
    super(message);
    this.name = "ProposalError";
  }
}

export const CANCELLATION_POLICIES = ["FLEXIBLE", "MODERATE", "STRICT"] as const;
export type CancellationPolicy = (typeof CANCELLATION_POLICIES)[number];

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = "MODERATE";

export type PlanStep = {
  session: number;
  focus: string;
  outcome: string;
};

export type ProposalDraft = {
  sessionCount: number;
  sessionMinutes: number;
  hourlyRateCents: number;
  totalCents: number;
  mode: "ONLINE" | "IN_PERSON";
  language: string;
  earliestStartAt: Date;
  planOutline: PlanStep[];
  preparationNotes: string;
  cancellationPolicy: CancellationPolicy;
};

// ─── Prefill ──────────────────────────────────────────────────────────────

/**
 * Build the plan outline from what the brief actually says.
 *
 * Prerequisite gaps come first — a student who can't factorise will not learn
 * the quadratic formula no matter how well it is explained — then the named
 * difficulties, then consolidation. Every session gets a stated outcome so the
 * student can see what they're buying and the tutor has something to mark
 * progress against later (see learning-journey.ts).
 */
export function buildPlanOutline(
  fields: BriefFields,
  sessionCount: number,
): PlanStep[] {
  const topic = fields.topic ?? fields.subject ?? "the topic";
  const gaps = fields.prerequisiteGaps ?? [];
  const difficulties = fields.difficulties ?? [];

  const focuses: Array<{ focus: string; outcome: string }> = [];

  for (const gap of gaps.slice(0, Math.max(0, sessionCount - 2))) {
    focuses.push({
      focus: `Close the gap in ${gap}`,
      outcome: `Can use ${gap} without help before we build on it`,
    });
  }
  for (const difficulty of difficulties) {
    focuses.push({
      focus: `Work through: ${difficulty}`,
      outcome: `Can handle this type of problem independently`,
    });
  }
  if (focuses.length === 0) {
    focuses.push({
      focus: `Diagnose exactly where ${topic} breaks down`,
      outcome: `A clear picture of what to practise`,
    });
  }

  const steps: PlanStep[] = [];
  for (let i = 0; i < sessionCount; i += 1) {
    const isLast = i === sessionCount - 1;
    if (isLast && sessionCount > 1) {
      steps.push({
        session: i + 1,
        focus:
          fields.deadlineKind === "EXAM"
            ? `Exam practice on ${topic} under time pressure`
            : `Consolidate ${topic} with mixed practice`,
        outcome:
          fields.learningObjective ??
          `Can apply ${topic} independently to unfamiliar problems`,
      });
      continue;
    }
    const chosen = focuses[i % focuses.length];
    steps.push({ session: i + 1, focus: chosen.focus, outcome: chosen.outcome });
  }
  return steps;
}

export function buildPreparationNotes(fields: BriefFields): string {
  const notes: string[] = [];
  if (fields.currentUnderstanding) {
    notes.push(`Student says: "${fields.currentUnderstanding}"`);
  }
  if ((fields.prerequisiteGaps?.length ?? 0) > 0) {
    notes.push(
      `Check these before session 1: ${fields.prerequisiteGaps!.join(", ")}.`,
    );
  }
  if (fields.deadlineAt) {
    notes.push(
      `Deadline ${fields.deadlineAt.toISOString().slice(0, 10)}${
        fields.deadlineKind === "EXAM" ? " (exam)" : ""
      } — plan backwards from it.`,
    );
  }
  if (fields.accessibilityNeeds) {
    notes.push(`Learning support: ${fields.accessibilityNeeds}`);
  }
  notes.push("The student has uploaded their own exercises — start from those.");
  return notes.join("\n");
}

/**
 * Soonest plausible start, honouring the student's stated availability. Falls
 * back to "in two days" rather than "now" so a proposal never promises a slot
 * the tutor hasn't looked at yet.
 */
export function computeEarliestStart(
  fields: BriefFields,
  from: Date = new Date(),
): Date {
  const windows = fields.availability ?? [];
  if (windows.length === 0) {
    return new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);
  }

  const dayIndex = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  let best: Date | null = null;
  for (const window of windows) {
    const target = dayIndex.indexOf(window.day);
    if (target === -1) continue;
    // Always at least one full day out: same-day proposals aren't realistic.
    let delta = (target - from.getDay() + 7) % 7;
    if (delta === 0) delta = 7;
    const [hours, minutes] = window.from.split(":").map(Number);
    const candidate = new Date(from);
    candidate.setDate(candidate.getDate() + delta);
    candidate.setHours(hours, minutes, 0, 0);
    if (!best || candidate < best) best = candidate;
  }
  return best ?? new Date(from.getTime() + 2 * 24 * 60 * 60 * 1000);
}

export function buildProposalDraft(
  fields: BriefFields,
  tutor: {
    hourlyRateCents: number;
    onlineOnly: boolean;
    languagesTaught: string[];
  },
  now: Date = new Date(),
): ProposalDraft {
  const estimate = estimateSessions(fields);
  const sessionCount = fields.estimatedSessions ?? estimate.sessions;
  const sessionMinutes = fields.sessionMinutes ?? estimate.minutes;

  const hours = (sessionCount * sessionMinutes) / 60;
  const totalCents = Math.round(tutor.hourlyRateCents * hours);

  // The brief's mode may be EITHER; resolve it to something concrete so the
  // student compares like with like across proposals.
  const mode: ProposalDraft["mode"] =
    fields.mode === "IN_PERSON" && !tutor.onlineOnly ? "IN_PERSON" : "ONLINE";

  const language =
    fields.language && tutor.languagesTaught.length > 0
      ? (tutor.languagesTaught.find(
          (l) => l.slice(0, 2).toLowerCase() === fields.language!.slice(0, 2).toLowerCase(),
        ) ?? fields.language)
      : (fields.language ?? "en");

  return {
    sessionCount,
    sessionMinutes,
    hourlyRateCents: tutor.hourlyRateCents,
    totalCents,
    mode,
    language,
    earliestStartAt: computeEarliestStart(fields, now),
    planOutline: buildPlanOutline(fields, sessionCount),
    preparationNotes: buildPreparationNotes(fields),
    cancellationPolicy: DEFAULT_CANCELLATION_POLICY,
  };
}

// ─── Persistence ──────────────────────────────────────────────────────────

function briefFieldsFromRow(row: {
  subject: string;
  topic: string | null;
  educationalLevel: string;
  learningObjective: string | null;
  currentUnderstanding: string | null;
  difficulties: string[];
  prerequisiteGaps: string[];
  language: string;
  mode: string;
  availability: Prisma.JsonValue | null;
  deadlineAt: Date | null;
  deadlineKind: string | null;
  accessibilityNeeds: string | null;
  estimatedSessions: number | null;
  sessionMinutes: number | null;
}): BriefFields {
  return {
    subject: row.subject || undefined,
    topic: row.topic ?? undefined,
    educationalLevel:
      (row.educationalLevel as BriefFields["educationalLevel"]) || undefined,
    learningObjective: row.learningObjective ?? undefined,
    currentUnderstanding: row.currentUnderstanding ?? undefined,
    difficulties: row.difficulties,
    prerequisiteGaps: row.prerequisiteGaps,
    language: row.language,
    mode: row.mode as BriefFields["mode"],
    availability: (row.availability as BriefFields["availability"]) ?? undefined,
    deadlineAt: row.deadlineAt ?? undefined,
    deadlineKind: (row.deadlineKind as BriefFields["deadlineKind"]) ?? undefined,
    accessibilityNeeds: row.accessibilityNeeds ?? undefined,
    estimatedSessions: row.estimatedSessions ?? undefined,
    sessionMinutes: row.sessionMinutes ?? undefined,
  };
}

/**
 * Get (or create) this tutor's prepared proposal for a brief-driven request.
 *
 * Idempotent by design: the tutor's request page calls it on every visit, and
 * an already-adjusted draft must survive a refresh untouched. Only a pristine
 * DRAFT that the tutor has not edited gets re-prefilled.
 */
export async function getOrCreatePreparedProposal(
  quoteRequestId: string,
  tutorId: string,
): Promise<{ quoteId: string; draft: ProposalDraft; status: string }> {
  const request = await prisma.eduQuoteRequest.findUnique({
    where: { id: quoteRequestId },
    include: { brief: true, matchCandidates: { where: { tutorId } } },
  });
  if (!request) throw new ProposalError("Request not found.", "NOT_FOUND");
  if (!request.brief) {
    throw new ProposalError(
      "This request has no learning brief attached.",
      "NOT_FOUND",
    );
  }
  if (request.status !== "OPEN") {
    throw new ProposalError(
      `This request is ${request.status.toLowerCase()}.`,
      "INVALID_STATE",
    );
  }
  // Brief-driven requests are invite-only: only the matched tutors may quote.
  // Without this, the five-tutor promise leaks the moment a request id does.
  if (request.matchCandidates.length === 0) {
    throw new ProposalError(
      "You were not invited to this request.",
      "NOT_INVITED",
    );
  }

  const tutor = await prisma.eduTutorProfile.findUnique({
    where: { userId: tutorId },
    select: { hourlyRateCents: true, onlineOnly: true, languagesTaught: true },
  });
  if (!tutor) throw new ProposalError("Tutor profile not found.", "NOT_FOUND");

  const fields = briefFieldsFromRow(request.brief);
  const draft = buildProposalDraft(fields, tutor);

  const existing = await prisma.eduQuote.findUnique({
    where: { quoteRequestId_tutorId: { quoteRequestId, tutorId } },
  });

  if (existing) {
    if (existing.status !== "DRAFT" || existing.tutorAdjusted) {
      return {
        quoteId: existing.id,
        status: existing.status,
        draft: rowToDraft(existing, draft),
      };
    }
    const refreshed = await prisma.eduQuote.update({
      where: { id: existing.id },
      data: draftToRow(draft, request.brief.id),
    });
    return { quoteId: refreshed.id, status: refreshed.status, draft };
  }

  const created = await prisma.eduQuote.create({
    data: {
      quoteRequestId,
      tutorId,
      status: "DRAFT",
      aiDrafted: true,
      ...draftToRow(draft, request.brief.id),
    },
  });
  return { quoteId: created.id, status: created.status, draft };
}

function draftToRow(draft: ProposalDraft, briefId: string) {
  return {
    briefId,
    hourlyRateCents: draft.hourlyRateCents,
    estimatedHours: (draft.sessionCount * draft.sessionMinutes) / 60,
    totalCents: draft.totalCents,
    sessionCount: draft.sessionCount,
    sessionMinutes: draft.sessionMinutes,
    mode: draft.mode,
    language: draft.language,
    earliestStartAt: draft.earliestStartAt,
    planOutline: draft.planOutline as unknown as Prisma.InputJsonValue,
    preparationNotes: draft.preparationNotes,
    cancellationPolicy: draft.cancellationPolicy,
  };
}

function rowToDraft(
  row: {
    hourlyRateCents: number;
    totalCents: number;
    sessionCount: number | null;
    sessionMinutes: number | null;
    mode: string | null;
    language: string | null;
    earliestStartAt: Date | null;
    planOutline: Prisma.JsonValue | null;
    preparationNotes: string | null;
    cancellationPolicy: string | null;
  },
  fallback: ProposalDraft,
): ProposalDraft {
  return {
    sessionCount: row.sessionCount ?? fallback.sessionCount,
    sessionMinutes: row.sessionMinutes ?? fallback.sessionMinutes,
    hourlyRateCents: row.hourlyRateCents,
    totalCents: row.totalCents,
    mode: (row.mode as ProposalDraft["mode"]) ?? fallback.mode,
    language: row.language ?? fallback.language,
    earliestStartAt: row.earliestStartAt ?? fallback.earliestStartAt,
    planOutline: Array.isArray(row.planOutline)
      ? (row.planOutline as unknown as PlanStep[])
      : fallback.planOutline,
    preparationNotes: row.preparationNotes ?? fallback.preparationNotes,
    cancellationPolicy:
      (row.cancellationPolicy as CancellationPolicy) ??
      fallback.cancellationPolicy,
  };
}

export type ProposalAdjustment = Partial<
  Pick<
    ProposalDraft,
    | "sessionCount"
    | "sessionMinutes"
    | "hourlyRateCents"
    | "mode"
    | "language"
    | "earliestStartAt"
    | "planOutline"
    | "preparationNotes"
    | "cancellationPolicy"
  >
> & { notes?: string };

/** Tutor edits their prefilled proposal. Still not visible to the student. */
export async function adjustProposal(
  quoteId: string,
  tutorId: string,
  adjustment: ProposalAdjustment,
): Promise<{ quoteId: string; totalCents: number }> {
  const quote = await requireDraft(quoteId, tutorId);

  const sessionCount = adjustment.sessionCount ?? quote.sessionCount ?? 1;
  const sessionMinutes = adjustment.sessionMinutes ?? quote.sessionMinutes ?? 60;
  const hourlyRateCents = adjustment.hourlyRateCents ?? quote.hourlyRateCents;
  const estimatedHours = (sessionCount * sessionMinutes) / 60;

  const updated = await prisma.eduQuote.update({
    where: { id: quoteId },
    data: {
      sessionCount,
      sessionMinutes,
      hourlyRateCents,
      estimatedHours,
      totalCents: Math.round(hourlyRateCents * estimatedHours),
      mode: adjustment.mode ?? quote.mode,
      language: adjustment.language ?? quote.language,
      earliestStartAt: adjustment.earliestStartAt ?? quote.earliestStartAt,
      planOutline: (adjustment.planOutline ??
        quote.planOutline ??
        []) as unknown as Prisma.InputJsonValue,
      preparationNotes: adjustment.preparationNotes ?? quote.preparationNotes,
      cancellationPolicy:
        adjustment.cancellationPolicy ?? quote.cancellationPolicy,
      notes: adjustment.notes ?? quote.notes,
      // Marks the proposal as the tutor's own work, which also stops the
      // prefill from overwriting it on their next page load.
      tutorAdjusted: true,
    },
    select: { id: true, totalCents: true },
  });

  return { quoteId: updated.id, totalCents: updated.totalCents };
}

async function requireDraft(quoteId: string, tutorId: string) {
  const quote = await prisma.eduQuote.findFirst({
    where: { id: quoteId, tutorId },
  });
  if (!quote) throw new ProposalError("Proposal not found.", "NOT_FOUND");
  if (quote.status !== "DRAFT") {
    throw new ProposalError(
      `This proposal has already been ${quote.status.toLowerCase()}.`,
      "INVALID_STATE",
    );
  }
  return quote;
}

/**
 * The tutor approves the proposal. This is the only path that makes it visible
 * to the student, and it also records the tutor's response time — the number
 * that later feeds `medianResponseMinutes` in matching.
 */
export async function sendProposal(
  quoteId: string,
  tutorId: string,
): Promise<{ quoteId: string; sentAt: Date }> {
  const quote = await requireDraft(quoteId, tutorId);

  const candidate = await prisma.eduMatchCandidate.findFirst({
    where: { quoteRequestId: quote.quoteRequestId, tutorId },
    select: { invitedAt: true },
  });

  const sentAt = new Date();

  const responseMinutes = candidate?.invitedAt
    ? Math.max(
        0,
        Math.round((sentAt.getTime() - candidate.invitedAt.getTime()) / 60000),
      )
    : null;
  const profile = await prisma.eduTutorProfile.findUnique({
    where: { userId: tutorId },
    select: { medianResponseMinutes: true },
  });

  await prisma.$transaction([
    prisma.eduQuote.update({
      where: { id: quoteId },
      data: { status: "PENDING", sentAt },
    }),
    prisma.eduTutorProfile.update({
      where: { userId: tutorId },
      data: {
        proposalsSent: { increment: 1 },
        ...(responseMinutes !== null
          ? {
              medianResponseMinutes: blendResponseTime(
                profile?.medianResponseMinutes ?? null,
                responseMinutes,
              ),
            }
          : {}),
      },
    }),
  ]);

  const request = await prisma.eduQuoteRequest.findUnique({
    where: { id: quote.quoteRequestId },
    select: {
      id: true,
      studentId: true,
      inquiryId: true,
      inquiry: {
        select: {
          subject: true,
          student: { select: { email: true, name: true } },
        },
      },
    },
  });
  const tutorUser = await prisma.user.findUnique({
    where: { id: tutorId },
    select: { name: true },
  });
  if (request) {
    void notifyStudentOfQuoteSubmitted({
      studentId: request.studentId,
      studentEmail: request.inquiry.student.email,
      studentName: request.inquiry.student.name,
      tutorName: tutorUser?.name ?? null,
      inquiryId: request.inquiryId,
      quoteRequestId: request.id,
      subject: request.inquiry.subject,
      hourlyRateCents: quote.hourlyRateCents,
    });
  }

  void recordEduAuditEvent({
    actorId: tutorId,
    actorRole: "TUTOR",
    action: "QUOTE_SUBMITTED",
    entity: "EduQuote",
    entityId: quoteId,
    prevState: "DRAFT",
    nextState: "PENDING",
    metadata: { aiDrafted: quote.aiDrafted, tutorAdjusted: quote.tutorAdjusted },
  });

  return { quoteId, sentAt };
}

/**
 * Exponentially-weighted running average, stored in `medianResponseMinutes`.
 * A true median needs the full response history; this tracks the same signal
 * (how fast does this tutor usually reply?) at constant cost, and matching
 * only needs it accurate to the hour.
 */
export function blendResponseTime(
  current: number | null,
  observedMinutes: number,
): number {
  if (current === null) return observedMinutes;
  return Math.round(current * 0.7 + observedMinutes * 0.3);
}

/** The tutor passes on the request. Also a response, so it counts as one. */
export async function declineProposal(
  quoteId: string,
  tutorId: string,
  reason?: string,
): Promise<void> {
  const quote = await requireDraft(quoteId, tutorId);
  await prisma.eduQuote.update({
    where: { id: quote.id },
    data: {
      status: "DECLINED",
      declineReason: reason?.slice(0, 1000) ?? null,
    },
  });

  void recordEduAuditEvent({
    actorId: tutorId,
    actorRole: "TUTOR",
    action: "QUOTE_DECLINED",
    entity: "EduQuote",
    entityId: quoteId,
    prevState: "DRAFT",
    nextState: "DECLINED",
    reason,
  });
}

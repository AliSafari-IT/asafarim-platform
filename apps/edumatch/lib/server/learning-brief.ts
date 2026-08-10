/**
 * The Learning Brief — the structured document at the centre of EduMatch.
 *
 * The product promise is "show us what you are learning, we will help you
 * understand it and find the right tutor when you need one". That only works
 * if the platform genuinely understands the request before it goes anywhere
 * near a tutor. This module owns the *shape* of that understanding: what a
 * brief contains, which parts are load-bearing, how complete it currently is,
 * and — when it isn't complete — which single question to ask next.
 *
 * Deliberately free of AI calls and Prisma. Extraction lives in
 * `learning-intake.ts`, persistence in `learning-briefs.ts`. Keeping the rules
 * pure means the "never pretend to understand the student's level" guarantee
 * is unit-testable without a database or a model provider.
 */

import { z } from "zod";
import { attachmentSchema, GRADE_LEVELS } from "./validation";

export const BRIEF_MODES = ["ONLINE", "IN_PERSON", "EITHER"] as const;
export type BriefMode = (typeof BRIEF_MODES)[number];

export const DEADLINE_KINDS = ["EXAM", "ASSIGNMENT", "NONE"] as const;
export type DeadlineKind = (typeof DEADLINE_KINDS)[number];

export const TRIAGE_OUTCOMES = [
  "SELF_STUDY",
  "TUTOR_RECOMMENDED",
  "NEEDS_DIAGNOSTIC",
] as const;
export type TriageOutcome = (typeof TRIAGE_OUTCOMES)[number];

export const BRIEF_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "MATCHED",
  "ARCHIVED",
] as const;
export type BriefStatus = (typeof BRIEF_STATUSES)[number];

export const WEEKDAYS = [
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
  "SUN",
] as const;
export type Weekday = (typeof WEEKDAYS)[number];

/** "16:00" — 24h wall clock, no timezone. Availability is local to the student. */
const timeOfDay = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "expected HH:MM (24h)");

export const availabilityWindowSchema = z
  .object({
    day: z.enum(WEEKDAYS),
    from: timeOfDay,
    to: timeOfDay,
  })
  .refine((w) => w.from < w.to, {
    message: "availability window must end after it starts",
  });
export type AvailabilityWindow = z.infer<typeof availabilityWindowSchema>;

export const diagnosticResultSchema = z.object({
  questions: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  answers: z.array(z.string().trim().max(1000)).max(10).default([]),
  scorePct: z.number().min(0).max(100).optional(),
});
export type DiagnosticResult = z.infer<typeof diagnosticResultSchema>;

/**
 * Every field a brief can carry. All optional: a brief is built up turn by
 * turn, and an empty draft is a legitimate state (the student has only said
 * "I'm stuck on maths" so far).
 */
export const briefFieldsSchema = z.object({
  subject: z.string().trim().min(2).max(80).optional(),
  topic: z.string().trim().min(2).max(160).optional(),
  educationalLevel: z.enum(GRADE_LEVELS).optional(),
  schoolYear: z.string().trim().min(1).max(60).optional(),
  learningObjective: z.string().trim().min(3).max(1000).optional(),
  currentUnderstanding: z.string().trim().min(3).max(1000).optional(),
  difficulties: z.array(z.string().trim().min(2).max(200)).max(10).optional(),
  prerequisiteGaps: z
    .array(z.string().trim().min(2).max(200))
    .max(10)
    .optional(),
  language: z.string().trim().min(2).max(10).optional(),
  mode: z.enum(BRIEF_MODES).optional(),
  locationCity: z.string().trim().min(1).max(120).optional(),
  availability: z.array(availabilityWindowSchema).max(21).optional(),
  deadlineAt: z.coerce.date().optional(),
  deadlineKind: z.enum(DEADLINE_KINDS).optional(),
  accessibilityNeeds: z.string().trim().max(1000).optional(),
  estimatedSessions: z.number().int().min(1).max(50).optional(),
  sessionMinutes: z.number().int().min(30).max(240).optional(),
});
export type BriefFields = z.infer<typeof briefFieldsSchema>;

/** What the student may edit directly on the review screen before confirming. */
export const briefPatchSchema = briefFieldsSchema.extend({
  attachments: z.array(attachmentSchema).max(10).optional(),
});
export type BriefPatch = z.infer<typeof briefPatchSchema>;

/** The opening message of an intake conversation. */
export const intakeStartSchema = z.object({
  message: z.string().trim().min(2).max(4000),
  attachments: z.array(attachmentSchema).max(5).default([]),
  /** App locale, used as the language fallback — see resolveBriefLanguage(). */
  localeHint: z.string().trim().min(2).max(10).optional(),
});
export type IntakeStart = z.infer<typeof intakeStartSchema>;

/** A student's reply to the one question the assistant just asked. */
export const intakeReplySchema = z.object({
  message: z.string().trim().min(1).max(4000),
  attachments: z.array(attachmentSchema).max(5).default([]),
});
export type IntakeReply = z.infer<typeof intakeReplySchema>;

// ─── Completeness ─────────────────────────────────────────────────────────

/**
 * The fields a brief needs before it is worth a tutor's time, in the order we
 * ask for them. Order matters: this list *is* the interview script, and the
 * first unfilled entry is the next question. It runs cheapest-and-most-
 * clarifying first (what and at what level) before logistics (when, where, in
 * which language), because a student who bails after two questions has still
 * given us enough to help them directly.
 *
 * `weight` sums to 1 across required fields and drives the completeness score.
 * `appliesTo` lets a field be conditionally required — asking "which city?"
 * of a student who already said "online" is exactly the kind of pointless
 * question this design exists to avoid.
 */
export type BriefRequirement = {
  field: keyof BriefFields;
  weight: number;
  /** Translation key for the question to ask when this field is missing. */
  questionKey: string;
  /** English fallback, also used as the model-facing question text. */
  question: string;
  appliesTo?: (fields: BriefFields) => boolean;
};

export const BRIEF_REQUIREMENTS: BriefRequirement[] = [
  {
    field: "subject",
    weight: 0.16,
    questionKey: "edumatch.learn.q.subject",
    question: "Which subject is this about?",
  },
  {
    field: "topic",
    weight: 0.14,
    questionKey: "edumatch.learn.q.topic",
    question: "Which topic or chapter are you working on right now?",
  },
  {
    field: "educationalLevel",
    weight: 0.14,
    questionKey: "edumatch.learn.q.level",
    question: "Which school year are you in?",
  },
  {
    field: "currentUnderstanding",
    weight: 0.14,
    questionKey: "edumatch.learn.q.understanding",
    question:
      "Can you show me the exercise where you became stuck, or describe what happens when you try it?",
  },
  {
    field: "learningObjective",
    weight: 0.14,
    questionKey: "edumatch.learn.q.objective",
    question:
      "Is your goal to understand the topic, or to prepare for a specific test?",
  },
  {
    field: "mode",
    weight: 0.1,
    questionKey: "edumatch.learn.q.mode",
    question: "Would you prefer lessons online or in person?",
  },
  {
    field: "locationCity",
    weight: 0.06,
    questionKey: "edumatch.learn.q.location",
    question: "Which city or area should we look for a tutor in?",
    // Only in-person and undecided students need a location.
    appliesTo: (f) => f.mode !== "ONLINE",
  },
  {
    field: "language",
    weight: 0.06,
    questionKey: "edumatch.learn.q.language",
    question: "Which language should the tutor teach in?",
  },
  {
    field: "availability",
    weight: 0.06,
    questionKey: "edumatch.learn.q.availability",
    question: "Which days and times are you usually free?",
  },
];

function isFilled(fields: BriefFields, field: keyof BriefFields): boolean {
  const value = fields[field];
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** Requirements that actually apply to this brief, given what's known so far. */
export function applicableRequirements(
  fields: BriefFields,
): BriefRequirement[] {
  return BRIEF_REQUIREMENTS.filter((r) => !r.appliesTo || r.appliesTo(fields));
}

/** Required fields that are still empty, in interview order. */
export function missingBriefFields(fields: BriefFields): BriefRequirement[] {
  return applicableRequirements(fields).filter((r) => !isFilled(fields, r.field));
}

/**
 * 0..1 completeness, weighted over the requirements that apply. This is the
 * brief's confidence: it is derived from what the student actually told us,
 * never from how sure the model sounded. A model that confidently invents a
 * school year still leaves `educationalLevel` empty here, so the brief stays
 * incomplete and the question still gets asked.
 */
export function computeBriefCompleteness(fields: BriefFields): number {
  const applicable = applicableRequirements(fields);
  const total = applicable.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return 1;
  const filled = applicable
    .filter((r) => isFilled(fields, r.field))
    .reduce((sum, r) => sum + r.weight, 0);
  return Math.round((filled / total) * 100) / 100;
}

/**
 * The single next question to ask, or null when the brief is complete enough
 * to review. One at a time, by design — a wall of form fields is exactly the
 * experience this replaces.
 *
 * `alreadyAsked` guards against re-asking a field the student declined to
 * answer: if we've asked about it and moved on, we skip it rather than
 * trapping the conversation in a loop.
 */
export function nextBriefQuestion(
  fields: BriefFields,
  alreadyAsked: readonly string[] = [],
): BriefRequirement | null {
  const asked = new Set(alreadyAsked);
  const missing = missingBriefFields(fields);
  return missing.find((r) => !asked.has(r.field)) ?? null;
}

/**
 * A brief is ready for the student to review once every applicable required
 * field is either filled or has been asked about once. We do not demand
 * perfection — a student who won't say which city they're in can still get
 * online tutors — but we do demand that we *asked*.
 */
export function isBriefReadyForReview(
  fields: BriefFields,
  alreadyAsked: readonly string[] = [],
): boolean {
  return nextBriefQuestion(fields, alreadyAsked) === null;
}

/**
 * The hard floor for sharing a brief with tutors. Softer than "complete":
 * these four are the fields without which a tutor genuinely cannot judge
 * whether they can help, so a brief missing any of them can never be
 * confirmed, no matter how many questions the student skipped.
 */
export const BRIEF_SHARING_ESSENTIALS: Array<keyof BriefFields> = [
  "subject",
  "topic",
  "educationalLevel",
  "learningObjective",
];

export function briefBlockersForSharing(
  fields: BriefFields,
): Array<keyof BriefFields> {
  return BRIEF_SHARING_ESSENTIALS.filter((f) => !isFilled(fields, f));
}

// ─── Language ─────────────────────────────────────────────────────────────

/**
 * Which language the tutor should teach in. Explicit student preference wins;
 * then their profile default; then the app locale. Same reasoning as
 * buildSystemPrompt() in the AI orchestrator: a two-word question ("algebera
 * II") carries no reliable language signal, so we fall back to something we
 * actually know rather than letting a model guess.
 */
export function resolveBriefLanguage(opts: {
  stated?: string | null;
  profilePreferred?: string | null;
  localeHint?: string | null;
}): string {
  const candidate = opts.stated ?? opts.profilePreferred ?? opts.localeHint;
  if (!candidate) return "en";
  return candidate.trim().slice(0, 2).toLowerCase();
}

// ─── Session estimate ─────────────────────────────────────────────────────

/**
 * A first-pass estimate of how much tutoring the brief implies, used to
 * pre-fill tutor proposals so the tutor's job is to check a plan rather than
 * invent one. Intentionally conservative and rule-based: an estimate the
 * student can sanity-check beats a model's confident guess, and the tutor
 * adjusts it anyway.
 */
export function estimateSessions(fields: BriefFields): {
  sessions: number;
  minutes: number;
  rationale: string;
} {
  const reasons: string[] = [];
  let sessions = 3;

  const difficultyCount = fields.difficulties?.length ?? 0;
  if (difficultyCount >= 3) {
    sessions += 2;
    reasons.push("several distinct difficulties named");
  } else if (difficultyCount === 0) {
    reasons.push("a single focused difficulty");
    sessions -= 1;
  }

  const gapCount = fields.prerequisiteGaps?.length ?? 0;
  if (gapCount > 0) {
    sessions += Math.min(gapCount, 3);
    reasons.push(`${gapCount} prerequisite gap(s) to close first`);
  }

  // An exam within a fortnight compresses the plan rather than extending it —
  // there is no point proposing eight lessons for a test in ten days.
  if (fields.deadlineAt) {
    const daysLeft = Math.ceil(
      (fields.deadlineAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );
    if (daysLeft > 0 && daysLeft <= 14) {
      sessions = Math.min(sessions, Math.max(2, Math.floor(daysLeft / 3)));
      reasons.push(`deadline in ${daysLeft} day(s)`);
    }
  }

  sessions = Math.max(1, Math.min(sessions, 12));

  // Younger students lose focus sooner; a 90-minute block is a poor default
  // for a 13-year-old and a reasonable one for an undergraduate.
  const minutes = fields.educationalLevel === "K12" ? 60 : 90;

  return {
    sessions,
    minutes,
    rationale: reasons.length > 0 ? reasons.join("; ") : "standard starting plan",
  };
}

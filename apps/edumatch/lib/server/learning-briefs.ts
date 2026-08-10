/**
 * Persistence and orchestration for the learning-brief journey:
 *
 *   Ask → Understand → Clarify → Help now → Build brief → Confirm
 *
 * One turn of the conversation is one call to `startIntake` or `replyToIntake`.
 * Each call moderates the student's message, re-analyses everything said so
 * far, writes the assistant's response as turns, and returns the current state
 * of the brief plus whatever the student should see next: an answer, one
 * question, or a brief ready for review.
 *
 * The brief is the student's document until they confirm it. Nothing is shared
 * with a tutor before `confirmBrief`, and confirmation is refused outright if
 * the brief is missing anything a tutor would actually need
 * (BRIEF_SHARING_ESSENTIALS).
 */

import { prisma, Prisma } from "@asafarim/db";
import { recordEduAuditEvent } from "./audit";
import {
  moderatePrompt,
  moderationAllowsGeneration,
  type ModerationDecision,
} from "./moderation";
import { getSignedDownloadUrl } from "./storage";
import {
  briefBlockersForSharing,
  computeBriefCompleteness,
  estimateSessions,
  isBriefReadyForReview,
  nextBriefQuestion,
  normaliseAvailability,
  resolveBriefLanguage,
  type BriefFields,
  type BriefPatch,
  type IntakeReply,
  type IntakeStart,
} from "./learning-brief";
import {
  analyseIntake,
  type ImmediateHelp,
  type IntakeAnalysis,
  type IntakeTurnView,
} from "./learning-intake";
import type { Attachment } from "./validation";

export class BriefError extends Error {
  constructor(
    message: string,
    readonly code:
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "INCOMPLETE"
      | "REFUSED" = "INVALID_STATE",
  ) {
    super(message);
    this.name = "BriefError";
  }
}

export type BriefTurn = {
  id: string;
  role: "STUDENT" | "ASSISTANT";
  kind: "MESSAGE" | "QUESTION" | "HELP" | "SUMMARY";
  content: string;
  field: string | null;
  createdAt: Date;
};

export type BriefView = {
  id: string;
  status: string;
  fields: BriefFields;
  attachments: Attachment[];
  completeness: number;
  triageOutcome: string | null;
  triageRationale: string | null;
  blockers: string[];
  readyForReview: boolean;
  confirmedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

/** What one conversational turn hands back to the UI. */
export type IntakeStepResult = {
  brief: BriefView;
  turns: BriefTurn[];
  /** The single question to ask now, or null when the brief is ready. */
  question: { field: string; questionKey: string; text: string } | null;
  help: ImmediateHelp | null;
  moderation: ModerationDecision;
};

type BriefRow = Prisma.EduLearningBriefGetPayload<{ include: { turns: true } }>;

// ─── Row ⇄ domain mapping ─────────────────────────────────────────────────

function rowToFields(row: BriefRow): BriefFields {
  return {
    subject: row.subject || undefined,
    topic: row.topic ?? undefined,
    educationalLevel:
      (row.educationalLevel as BriefFields["educationalLevel"]) || undefined,
    schoolYear: row.schoolYear ?? undefined,
    learningObjective: row.learningObjective ?? undefined,
    currentUnderstanding: row.currentUnderstanding ?? undefined,
    difficulties: row.difficulties.length > 0 ? row.difficulties : undefined,
    prerequisiteGaps:
      row.prerequisiteGaps.length > 0 ? row.prerequisiteGaps : undefined,
    language: row.language || undefined,
    mode: (row.mode as BriefFields["mode"]) || undefined,
    locationCity: row.locationCity ?? undefined,
    availability: Array.isArray(row.availability)
      ? normaliseAvailability(
          row.availability as NonNullable<BriefFields["availability"]>,
        )
      : undefined,
    deadlineAt: row.deadlineAt ?? undefined,
    deadlineKind: (row.deadlineKind as BriefFields["deadlineKind"]) ?? undefined,
    accessibilityNeeds: row.accessibilityNeeds ?? undefined,
    estimatedSessions: row.estimatedSessions ?? undefined,
    sessionMinutes: row.sessionMinutes ?? undefined,
  };
}

/**
 * `subject` and `educationalLevel` are NOT NULL on the row but optional in the
 * domain, because a brief exists from the student's first sentence — before
 * either is known. Empty string is the "not yet established" marker; every
 * read path maps it back to undefined so nothing downstream mistakes "" for a
 * real subject.
 */
function fieldsToRowData(fields: BriefFields) {
  return {
    subject: fields.subject ?? "",
    topic: fields.topic ?? null,
    educationalLevel: fields.educationalLevel ?? "",
    schoolYear: fields.schoolYear ?? null,
    learningObjective: fields.learningObjective ?? null,
    currentUnderstanding: fields.currentUnderstanding ?? null,
    difficulties: fields.difficulties ?? [],
    prerequisiteGaps: fields.prerequisiteGaps ?? [],
    language: fields.language ?? "en",
    mode: fields.mode ?? "EITHER",
    locationCity: fields.locationCity ?? null,
    // Prisma distinguishes "leave alone" (undefined) from "write SQL NULL"
    // (DbNull) on nullable JSON columns; a bare null is neither.
    availability: (fields.availability
      ? normaliseAvailability(fields.availability)
      : Prisma.DbNull) as Prisma.InputJsonValue,
    deadlineAt: fields.deadlineAt ?? null,
    deadlineKind: fields.deadlineKind ?? null,
    accessibilityNeeds: fields.accessibilityNeeds ?? null,
    estimatedSessions: fields.estimatedSessions ?? null,
    sessionMinutes: fields.sessionMinutes ?? null,
    confidence: computeBriefCompleteness(fields),
  };
}

function toBriefView(row: BriefRow): BriefView {
  const fields = rowToFields(row);
  return {
    id: row.id,
    status: row.status,
    fields,
    attachments: (row.attachments as Attachment[] | null) ?? [],
    completeness: computeBriefCompleteness(fields),
    triageOutcome: row.triageOutcome,
    triageRationale: row.triageRationale,
    blockers: briefBlockersForSharing(fields),
    readyForReview: isBriefReadyForReview(fields, askedFields(row.turns)),
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toTurns(rows: BriefRow["turns"]): BriefTurn[] {
  return [...rows]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((t) => ({
      id: t.id,
      role: t.role as BriefTurn["role"],
      kind: t.kind as BriefTurn["kind"],
      content: t.content,
      field: t.field,
      createdAt: t.createdAt,
    }));
}

/** Brief fields we have already put a question to the student about. */
export function askedFields(turns: BriefRow["turns"]): string[] {
  return turns
    .filter((t) => t.kind === "QUESTION" && t.field)
    .map((t) => t.field as string);
}

function toIntakeTurnViews(turns: BriefRow["turns"]): IntakeTurnView[] {
  return [...turns]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((t) => ({
      role: t.role as IntakeTurnView["role"],
      kind: t.kind as IntakeTurnView["kind"],
      content: t.content,
      field: t.field,
    }));
}

// ─── Reads ────────────────────────────────────────────────────────────────

async function loadBrief(briefId: string, studentId: string): Promise<BriefRow> {
  const row = await prisma.eduLearningBrief.findFirst({
    where: { id: briefId, studentId },
    include: { turns: true },
  });
  // Ownership is part of the query, so someone else's brief is indistinguish-
  // able from one that doesn't exist.
  if (!row) throw new BriefError("Learning brief not found.", "NOT_FOUND");
  return row;
}

export async function getBrief(
  briefId: string,
  studentId: string,
): Promise<{ brief: BriefView; turns: BriefTurn[] }> {
  const row = await loadBrief(briefId, studentId);
  return { brief: toBriefView(row), turns: toTurns(row.turns) };
}

export async function listBriefsForStudent(studentId: string, limit = 50) {
  const rows = await prisma.eduLearningBrief.findMany({
    where: { studentId },
    orderBy: { updatedAt: "desc" },
    take: limit,
    include: { turns: true },
  });
  return rows.map(toBriefView);
}

// ─── Attachments ──────────────────────────────────────────────────────────

/**
 * Stored attachments live in a private bucket, so the model can't read them
 * from the persisted key alone — mint short-lived signed URLs for the vision
 * call. Images and PDFs only; audio is handled by the existing Whisper path.
 */
async function signForModel(
  attachments: Attachment[],
): Promise<Array<{ url: string; mime: string }>> {
  return Promise.all(
    attachments.map(async (a) => ({
      mime: a.mime,
      url: a.key ? await getSignedDownloadUrl(a.key) : a.url,
    })),
  );
}

// ─── Conversation ─────────────────────────────────────────────────────────

/**
 * Turn an analysis into the assistant's visible response: at most one help
 * turn, then at most one question. Written as turns so the transcript the
 * student sees and the transcript the next analysis reads are the same thing.
 */
async function writeAssistantTurns(
  briefId: string,
  analysis: IntakeAnalysis,
  asked: readonly string[],
  existingTurns: readonly IntakeTurnView[] = [],
): Promise<{ question: IntakeStepResult["question"]; help: ImmediateHelp | null }> {
  const creates: Prisma.EduIntakeTurnCreateManyInput[] = [];

  // Belt-and-suspenders: even though the prompt tells the model to omit
  // "help" once it has already taught this topic, don't trust it blindly —
  // if the newly produced help renders to text we've already shown the
  // student, drop it rather than repeat the same explanation every turn.
  const alreadyRenderedHelp = new Set(
    existingTurns
      .filter((t) => t.role === "ASSISTANT" && t.kind === "HELP")
      .map((t) => t.content),
  );
  const help =
    analysis.help && !alreadyRenderedHelp.has(renderHelp(analysis.help))
      ? analysis.help
      : null;

  if (help) {
    creates.push({
      briefId,
      role: "ASSISTANT",
      kind: "HELP",
      content: renderHelp(help),
    });
  }

  const requirement = nextBriefQuestion(analysis.fields, asked);
  let question: IntakeStepResult["question"] = null;
  if (requirement) {
    question = {
      field: requirement.field,
      questionKey: requirement.questionKey,
      text: requirement.question,
    };
    creates.push({
      briefId,
      role: "ASSISTANT",
      kind: "QUESTION",
      content: requirement.question,
      field: requirement.field,
    });
  }

  if (creates.length > 0) {
    // createMany shares a single `now()` per row, and the transcript is
    // ordered by createdAt — nudge the question forward so help always
    // renders above the question that follows it.
    const base = Date.now();
    await prisma.eduIntakeTurn.createMany({
      data: creates.map((c, i) => ({
        ...c,
        createdAt: new Date(base + i),
      })),
    });
  }

  return { question, help };
}

/** Flatten structured help into the markdown the chat transcript stores. */
export function renderHelp(help: ImmediateHelp): string {
  const parts: string[] = [];
  if (help.explanation) parts.push(help.explanation);
  if (help.workedExample) {
    parts.push(`**Worked example**\n\n${help.workedExample}`);
  }
  if (help.practiceQuestions.length > 0) {
    parts.push(
      `**Try these**\n\n${help.practiceQuestions.map((q) => `- ${q}`).join("\n")}`,
    );
  }
  if (help.studySteps.length > 0) {
    parts.push(
      `**Suggested steps**\n\n${help.studySteps
        .map((s, i) => `${i + 1}. ${s}`)
        .join("\n")}`,
    );
  }
  if (help.prerequisiteGaps.length > 0) {
    parts.push(
      `**Worth revisiting first**\n\n${help.prerequisiteGaps
        .map((g) => `- ${g}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}

/**
 * A refused message never reaches a provider and never becomes part of the
 * brief. The student sees the redirection text as an assistant turn so the
 * conversation stays coherent rather than silently swallowing their message.
 */
async function writeRefusal(
  briefId: string,
  moderation: ModerationDecision,
): Promise<string> {
  const text =
    moderation.redirectMessage ??
    "I can't help with that one. Tell me what you're trying to understand and I'll walk you through the method instead.";
  await prisma.eduIntakeTurn.create({
    data: { briefId, role: "ASSISTANT", kind: "MESSAGE", content: text },
  });
  return text;
}

/**
 * Begin a conversation. The student has typed (or spoken, or photographed) one
 * thing and nothing else is known about them — deliberately no registration
 * form first.
 */
export async function startIntake(
  studentId: string,
  input: IntakeStart,
  opts: { profilePreferred?: string | null } = {},
): Promise<IntakeStepResult> {
  const moderation = moderatePrompt(input.message);

  const language = resolveBriefLanguage({
    profilePreferred: opts.profilePreferred,
    localeHint: input.localeHint,
  });

  const created = await prisma.eduLearningBrief.create({
    data: {
      studentId,
      subject: "",
      educationalLevel: "",
      language,
      attachments: input.attachments as unknown as Prisma.InputJsonValue,
      status: "DRAFT",
      turns: {
        create: {
          role: "STUDENT",
          kind: "MESSAGE",
          content: input.message,
          attachments: input.attachments as unknown as Prisma.InputJsonValue,
        },
      },
    },
    include: { turns: true },
  });

  void recordEduAuditEvent({
    actorId: studentId,
    actorRole: "STUDENT",
    action: "BRIEF_CREATED",
    entity: "EduLearningBrief",
    entityId: created.id,
    nextState: "DRAFT",
    metadata: { origin: "conversational-intake" },
  });

  if (!moderationAllowsGeneration(moderation)) {
    await writeRefusal(created.id, moderation);
    return finish(created.id, studentId, moderation, null, null);
  }

  const analysis = await analyseIntake({
    turns: toIntakeTurnViews(created.turns),
    known: { language },
    attachments: await signForModel(input.attachments),
    localeHint: input.localeHint,
  });

  await persistAnalysis(created.id, analysis);
  const { question, help } = await writeAssistantTurns(
    created.id,
    analysis,
    [],
    toIntakeTurnViews(created.turns),
  );
  return finish(created.id, studentId, moderation, question, help);
}

/** The student answers the question we asked (or just says something else). */
export async function replyToIntake(
  briefId: string,
  studentId: string,
  input: IntakeReply,
): Promise<IntakeStepResult> {
  const existing = await loadBrief(briefId, studentId);
  if (existing.status !== "DRAFT") {
    throw new BriefError(
      `This brief is ${existing.status.toLowerCase()} and can no longer be edited by chat.`,
      "INVALID_STATE",
    );
  }

  const moderation = moderatePrompt(input.message);

  await prisma.eduIntakeTurn.create({
    data: {
      briefId,
      role: "STUDENT",
      kind: "MESSAGE",
      content: input.message,
      attachments: input.attachments as unknown as Prisma.InputJsonValue,
    },
  });

  const mergedAttachments = [
    ...((existing.attachments as Attachment[] | null) ?? []),
    ...input.attachments,
  ].slice(0, 10);
  if (input.attachments.length > 0) {
    await prisma.eduLearningBrief.update({
      where: { id: briefId },
      data: {
        attachments: mergedAttachments as unknown as Prisma.InputJsonValue,
      },
    });
  }

  if (!moderationAllowsGeneration(moderation)) {
    await writeRefusal(briefId, moderation);
    return finish(briefId, studentId, moderation, null, null);
  }

  const reloaded = await loadBrief(briefId, studentId);
  const analysis = await analyseIntake({
    turns: toIntakeTurnViews(reloaded.turns),
    known: rowToFields(reloaded),
    attachments: await signForModel(mergedAttachments),
    localeHint: reloaded.language,
  });

  await persistAnalysis(briefId, analysis);
  const { question, help } = await writeAssistantTurns(
    briefId,
    analysis,
    askedFields(reloaded.turns),
    toIntakeTurnViews(reloaded.turns),
  );
  return finish(briefId, studentId, moderation, question, help);
}

async function persistAnalysis(
  briefId: string,
  analysis: IntakeAnalysis,
): Promise<void> {
  const estimate = estimateSessions(analysis.fields);
  await prisma.eduLearningBrief.update({
    where: { id: briefId },
    data: {
      ...fieldsToRowData(analysis.fields),
      // Only ever a suggestion — the student can override it on review and the
      // tutor can override it again on the proposal.
      estimatedSessions: analysis.fields.estimatedSessions ?? estimate.sessions,
      sessionMinutes: analysis.fields.sessionMinutes ?? estimate.minutes,
      triageOutcome: analysis.triage?.outcome ?? null,
      triageRationale: analysis.triage?.rationale ?? null,
      prerequisiteGaps: mergeGaps(analysis),
    },
  });
}

/** The model can surface prerequisite gaps in `help` as well as in `fields`. */
function mergeGaps(analysis: IntakeAnalysis): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const gap of [
    ...(analysis.fields.prerequisiteGaps ?? []),
    ...(analysis.help?.prerequisiteGaps ?? []),
  ]) {
    const key = gap.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(gap.trim());
  }
  return out.slice(0, 10);
}

async function finish(
  briefId: string,
  studentId: string,
  moderation: ModerationDecision,
  question: IntakeStepResult["question"],
  help: ImmediateHelp | null,
): Promise<IntakeStepResult> {
  const row = await loadBrief(briefId, studentId);
  return {
    brief: toBriefView(row),
    turns: toTurns(row.turns),
    question,
    help,
    moderation,
  };
}

// ─── Review and confirmation ──────────────────────────────────────────────

/** Student edits on the review screen. Their values always win over the AI's. */
export async function patchBrief(
  briefId: string,
  studentId: string,
  patch: BriefPatch,
): Promise<BriefView> {
  const existing = await loadBrief(briefId, studentId);
  if (existing.status === "ARCHIVED") {
    throw new BriefError("This brief is archived.", "INVALID_STATE");
  }

  const { attachments, ...fields } = patch;
  const merged: BriefFields = { ...rowToFields(existing) };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) (merged as Record<string, unknown>)[key] = value;
  }

  const row = await prisma.eduLearningBrief.update({
    where: { id: briefId },
    data: {
      ...fieldsToRowData(merged),
      ...(attachments
        ? { attachments: attachments as unknown as Prisma.InputJsonValue }
        : {}),
    },
    include: { turns: true },
  });
  return toBriefView(row);
}

/**
 * The student approves the brief for sharing. This is the only door between
 * "my private conversation" and "a document tutors can read", so it also
 * creates the EduInquiry the existing quote/booking machinery hangs off.
 */
export async function confirmBrief(
  briefId: string,
  studentId: string,
): Promise<BriefView> {
  const existing = await loadBrief(briefId, studentId);
  if (existing.status === "ARCHIVED") {
    throw new BriefError("This brief is archived.", "INVALID_STATE");
  }
  if (existing.confirmedAt) return toBriefView(existing);

  const fields = rowToFields(existing);
  const blockers = briefBlockersForSharing(fields);
  if (blockers.length > 0) {
    throw new BriefError(
      `The brief still needs: ${blockers.join(", ")}.`,
      "INCOMPLETE",
    );
  }

  const inquiryId =
    existing.inquiryId ?? (await createInquiryForBrief(studentId, existing));

  const row = await prisma.eduLearningBrief.update({
    where: { id: briefId },
    data: { status: "CONFIRMED", confirmedAt: new Date(), inquiryId },
    include: { turns: true },
  });

  void recordEduAuditEvent({
    actorId: studentId,
    actorRole: "STUDENT",
    action: "BRIEF_CONFIRMED",
    entity: "EduLearningBrief",
    entityId: briefId,
    prevState: existing.status,
    nextState: "CONFIRMED",
    metadata: { inquiryId },
  });

  return toBriefView(row);
}

/**
 * Project the brief onto the legacy EduInquiry shape. The inquiry carries the
 * brief rendered as prose in `description`, so every existing surface (tutor
 * request lists, admin tooling, quote PDFs) shows something meaningful without
 * being taught about briefs first.
 */
async function createInquiryForBrief(
  studentId: string,
  row: BriefRow,
): Promise<string> {
  const created = await prisma.eduInquiry.create({
    data: {
      studentId,
      subject: row.subject,
      gradeLevel: row.educationalLevel,
      description: renderBriefAsProse(row),
      attachments: (row.attachments ?? []) as Prisma.InputJsonValue,
      status: "AI_RESPONDED",
      aiSummary: row.triageRationale?.slice(0, 500) ?? null,
    },
    select: { id: true },
  });
  return created.id;
}

export function renderBriefAsProse(row: {
  subject: string;
  topic: string | null;
  educationalLevel: string;
  schoolYear: string | null;
  learningObjective: string | null;
  currentUnderstanding: string | null;
  difficulties: string[];
  prerequisiteGaps: string[];
  language: string;
  mode: string;
  locationCity: string | null;
  deadlineAt: Date | null;
  deadlineKind: string | null;
  accessibilityNeeds: string | null;
  estimatedSessions: number | null;
  sessionMinutes: number | null;
}): string {
  const lines: string[] = [
    `Subject: ${row.subject}${row.topic ? ` — ${row.topic}` : ""}`,
    `Level: ${row.educationalLevel}${row.schoolYear ? ` (${row.schoolYear})` : ""}`,
  ];
  if (row.learningObjective) lines.push(`Goal: ${row.learningObjective}`);
  if (row.currentUnderstanding) {
    lines.push(`Currently: ${row.currentUnderstanding}`);
  }
  if (row.difficulties.length > 0) {
    lines.push(`Stuck on: ${row.difficulties.join("; ")}`);
  }
  if (row.prerequisiteGaps.length > 0) {
    lines.push(`Likely gaps: ${row.prerequisiteGaps.join("; ")}`);
  }
  lines.push(`Language: ${row.language}`);
  lines.push(
    `Format: ${row.mode}${row.locationCity ? ` (${row.locationCity})` : ""}`,
  );
  if (row.deadlineAt) {
    lines.push(
      `Deadline: ${row.deadlineAt.toISOString().slice(0, 10)}${
        row.deadlineKind ? ` (${row.deadlineKind.toLowerCase()})` : ""
      }`,
    );
  }
  if (row.accessibilityNeeds) {
    lines.push(`Learning support: ${row.accessibilityNeeds}`);
  }
  if (row.estimatedSessions && row.sessionMinutes) {
    lines.push(
      `Suggested plan: ${row.estimatedSessions} × ${row.sessionMinutes} min`,
    );
  }
  return lines.join("\n");
}

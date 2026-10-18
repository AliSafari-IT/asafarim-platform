import { getBooleanSetting, getNumberSetting, prisma } from "@asafarim/db";
import { getEduAiSpend, utcMonthRange, type EduCostOperation } from "./ai-cost";

/**
 * AI tutor spend controls (#539): a kill switch, a platform-wide monthly
 * budget and a per-student monthly answer quota, checked before any paid
 * provider call on both AI paths (the queued `orchestrateResponse` and the
 * streaming `GET /api/inquiries/[id]/ai`).
 *
 * The limits are typed platform settings (`edumatch.ai.*` in
 * packages/db/src/settings.ts), so an admin changes them in Admin → Settings
 * and the next request picks the change up, with no redeploy. They are
 * platform-wide because EduMatch has no workspaces and the platform pays for
 * every call. Spend comes from the cost ledger (#540).
 *
 * A block is not a moderation refusal: nothing is persisted on the inquiry,
 * its status is unchanged, and the student can ask again once the block
 * lifts.
 */

export const EDUMATCH_AI_ENABLED_KEY = "edumatch.ai.enabled";
export const EDUMATCH_AI_MONTHLY_BUDGET_KEY = "edumatch.ai.monthlyBudgetUsd";
export const EDUMATCH_AI_STUDENT_QUOTA_KEY =
  "edumatch.ai.studentMonthlyAnswerQuota";

/** Catalog defaults, used when the settings store can't be read. */
const DEFAULT_ENABLED = true;
const DEFAULT_MONTHLY_BUDGET_USD = 50;
const DEFAULT_STUDENT_MONTHLY_QUOTA = 100;

const MICROS_PER_USD = 1_000_000;

/** The operations that count as one answer attempt toward a student's quota. */
const ANSWER_OPERATIONS: readonly EduCostOperation[] = [
  "tutor_answer",
  "tutor_answer_stream",
];

/**
 * - `disabled`: the kill switch is off, or the month's spend couldn't be
 *   verified (fail closed: an unbounded spend is the risk this guards).
 * - `budget`: the platform's monthly budget is used up.
 * - `student_quota`: this student used this month's AI answers.
 */
export type EduAiBlockReason = "disabled" | "budget" | "student_quota";

const BLOCK_MESSAGES: Record<EduAiBlockReason, string> = {
  disabled: "AI help is paused right now.",
  budget: "AI help has reached its limit for this month.",
  student_quota: "You've used your AI answers for this month.",
};

export class EduAiBlockedError extends Error {
  readonly reason: EduAiBlockReason;
  constructor(reason: EduAiBlockReason) {
    super(BLOCK_MESSAGES[reason]);
    this.name = "EduAiBlockedError";
    this.reason = reason;
  }
}

/** HTTP status for a blocked streaming request. */
export function blockedHttpStatus(reason: EduAiBlockReason): 429 | 503 {
  return reason === "student_quota" ? 429 : 503;
}

export interface EduAiLimits {
  enabled: boolean;
  monthlyBudgetUsd: number;
  studentMonthlyQuota: number;
}

export async function getEduAiLimits(): Promise<EduAiLimits> {
  const [enabled, monthlyBudgetUsd, studentMonthlyQuota] = await Promise.all([
    getBooleanSetting(EDUMATCH_AI_ENABLED_KEY, DEFAULT_ENABLED),
    getNumberSetting(
      EDUMATCH_AI_MONTHLY_BUDGET_KEY,
      DEFAULT_MONTHLY_BUDGET_USD
    ),
    getNumberSetting(
      EDUMATCH_AI_STUDENT_QUOTA_KEY,
      DEFAULT_STUDENT_MONTHLY_QUOTA
    ),
  ]);
  return { enabled, monthlyBudgetUsd, studentMonthlyQuota };
}

/**
 * Answer attempts this student started in `[from, to)`: distinct attempts
 * (`workflowId`) with a billed answer call, so an OpenAI → Anthropic fallback
 * inside one attempt counts once and a transcription alone counts zero.
 */
export async function countStudentAnswerAttempts(
  studentId: string,
  range: { from: Date; to: Date }
): Promise<number> {
  const rows = await prisma.eduAiCostEvent.findMany({
    where: {
      userId: studentId,
      operation: { in: [...ANSWER_OPERATIONS] },
      occurredAt: { gte: range.from, lt: range.to },
    },
    distinct: ["workflowId"],
    select: { workflowId: true },
  });
  return rows.length;
}

/**
 * Throws {@link EduAiBlockedError} when this student may not start a paid AI
 * attempt now. Checks, in order: kill switch, platform budget, student quota.
 * Call it before the in-flight claim and before any provider call,
 * transcription included.
 */
export async function assertCanGenerateAiResponse(
  studentId: string,
  now: Date = new Date()
): Promise<void> {
  const limits = await getEduAiLimits();
  if (!limits.enabled) throw new EduAiBlockedError("disabled");

  const range = utcMonthRange(now);

  if (limits.monthlyBudgetUsd <= 0) throw new EduAiBlockedError("budget");
  let spentMicros: bigint;
  try {
    spentMicros = (await getEduAiSpend(range)).effectiveKnownMicros;
  } catch (err) {
    console.error(
      "[AI quota] could not read this month's AI spend; blocking AI generation",
      err
    );
    throw new EduAiBlockedError("disabled");
  }
  const budgetMicros = BigInt(
    Math.round(limits.monthlyBudgetUsd * MICROS_PER_USD)
  );
  if (spentMicros >= budgetMicros) throw new EduAiBlockedError("budget");

  if (limits.studentMonthlyQuota <= 0)
    throw new EduAiBlockedError("student_quota");
  let attempts: number;
  try {
    attempts = await countStudentAnswerAttempts(studentId, range);
  } catch (err) {
    console.error(
      "[AI quota] could not count this student's AI answers; blocking AI generation",
      err
    );
    throw new EduAiBlockedError("disabled");
  }
  if (attempts >= limits.studentMonthlyQuota)
    throw new EduAiBlockedError("student_quota");
}

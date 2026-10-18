/**
 * Client-safe mapping from the streaming AI route's error reply to the
 * student-facing message key (#539). A spend-control block gets its own
 * message; anything else keeps the generic "AI unavailable".
 */
export type AiErrorMessageKey =
  | "edumatch.inquiry.detail.aiUnavailable"
  | "edumatch.inquiry.detail.aiPaused"
  | "edumatch.inquiry.detail.aiBudgetReached"
  | "edumatch.inquiry.detail.aiStudentQuotaReached";

const BLOCK_REASON_KEYS: Record<string, AiErrorMessageKey> = {
  disabled: "edumatch.inquiry.detail.aiPaused",
  budget: "edumatch.inquiry.detail.aiBudgetReached",
  student_quota: "edumatch.inquiry.detail.aiStudentQuotaReached",
};

export function aiErrorMessageKey(body: unknown): AiErrorMessageKey {
  if (body && typeof body === "object") {
    const { error, reason } = body as { error?: unknown; reason?: unknown };
    if (
      error === "ai_blocked" &&
      typeof reason === "string" &&
      Object.hasOwn(BLOCK_REASON_KEYS, reason)
    ) {
      return BLOCK_REASON_KEYS[reason]!;
    }
  }
  return "edumatch.inquiry.detail.aiUnavailable";
}

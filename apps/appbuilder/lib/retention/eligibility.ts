/**
 * Pure retention-eligibility predicates — no DB access, so they're testable
 * without a database and reusable by both the real sweep (lib/retention/sweep.ts)
 * and any future reporting surface. Each mirrors one row of
 * lib/retention/policy.ts#RETENTION_POLICIES.
 */

export function isValidationArtifactEligible(
  artifact: { retentionExpiresAt: Date | null },
  now: Date = new Date()
): boolean {
  return (
    artifact.retentionExpiresAt !== null &&
    artifact.retentionExpiresAt.getTime() < now.getTime()
  );
}

const CONVERSATION_MESSAGE_RETENTION_DAYS = 180;

/** Only archived-app conversation history is ever eligible — an active app's history stays fully retained regardless of age. */
export function isConversationMessageEligible(
  message: { createdAt: Date },
  app: { status: "active" | "archived" },
  now: Date = new Date()
): boolean {
  if (app.status !== "archived") return false;
  const ageMs = now.getTime() - message.createdAt.getTime();
  return ageMs > CONVERSATION_MESSAGE_RETENTION_DAYS * 86_400_000;
}

const AI_JOB_DIAGNOSTIC_RETENTION_DAYS = 90;
const TERMINAL_JOB_STATUSES = new Set([
  "ready",
  "failed",
  "cancelled",
  "succeeded",
  "passed",
  "rolled_back",
]);

/** Only a job that has REACHED a terminal state is ever eligible — an active/in-flight job's diagnostics are never touched regardless of `createdAt`. */
export function isAiJobDiagnosticEligible(
  job: { status: string; completedAt: Date | null },
  now: Date = new Date()
): boolean {
  if (!TERMINAL_JOB_STATUSES.has(job.status) || !job.completedAt) return false;
  const ageMs = now.getTime() - job.completedAt.getTime();
  return ageMs > AI_JOB_DIAGNOSTIC_RETENTION_DAYS * 86_400_000;
}

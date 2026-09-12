/**
 * App-wide AI kill switch. Core timeline creation/editing never depends on
 * this — it only gates the AI proposal endpoints (lib/server/services/ai-proposals.ts).
 * Defaults OFF: an unset or unrecognized value fails closed rather than
 * silently enabling model calls.
 */
export function isAiEnabled(): boolean {
  return process.env.TIMELINEAI_AI_ENABLED === "true";
}

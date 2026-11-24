/**
 * Why an AI step fell back (issue #756), for the candidate-facing message:
 * their own monthly budget is used up, the service-wide one is, or the
 * provider failed (anything that is not a budget refusal). Client-safe:
 * no server imports, so the Tailor flow can use it directly.
 */
export type DegradedReason = "workspace_budget" | "global_budget" | "provider";

export const DEGRADED_REASONS: readonly DegradedReason[] = ["workspace_budget", "global_budget", "provider"];

export function isDegradedReason(value: unknown): value is DegradedReason {
  return typeof value === "string" && (DEGRADED_REASONS as readonly string[]).includes(value);
}

/**
 * Maps the error that ended a provider call to a `DegradedReason`. Matches
 * `QuotaExceededError` (lib/tailoring/ai/quota.ts) by name and reads its
 * `scope`, so this client-safe module never imports the server-only class.
 */
export function degradedReasonOf(error: unknown): DegradedReason {
  if (error instanceof Error && error.name === "QuotaExceededError") {
    return (error as Error & { scope?: unknown }).scope === "global" ? "global_budget" : "workspace_budget";
  }
  return "provider";
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** A YYYY-MM-DD (UTC) date as a long local date, e.g. "1 December 2026". */
export function formatResetDate(isoDate: string, locale: string): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(date);
}

/**
 * The message for a degraded CV (`baseKey` "resumatch.review.degraded") or
 * letter ("resumatch.review.cl.degraded"): the specific one for a known
 * reason, else the generic base message. A budget message needs the reset
 * date; without one it falls back to the generic message too.
 */
export function degradedMessage(
  t: Translate,
  baseKey: string,
  reason: DegradedReason | "grounding" | null,
  resetsOn: string | null,
  locale: string,
): string {
  if (!reason) return t(baseKey);
  if (reason === "workspace_budget" || reason === "global_budget") {
    if (!resetsOn) return t(baseKey);
    return t(`${baseKey}.${reason}`, { date: formatResetDate(resetsOn, locale) });
  }
  return t(`${baseKey}.${reason}`);
}

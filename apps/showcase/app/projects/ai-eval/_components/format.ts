/** Display helpers for the AI-Eval demo. */

export function pct(n: number | null): string {
  if (n == null) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Bucket a 0–1 score into a tone class name (good / mid / bad). */
export function scoreTone(n: number): "scoreGood" | "scoreMid" | "scoreBad" {
  if (n >= 0.9) return "scoreGood";
  if (n >= 0.6) return "scoreMid";
  return "scoreBad";
}

export function fmtLatency(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(2)} s`;
}

/** Estimated cost per 1,000 cases, in USD. */
export function fmtCostPer1k(usd: number): string {
  return `$${usd.toFixed(3)}`;
}

export function pretty(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

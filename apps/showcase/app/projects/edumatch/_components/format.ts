/** Format cents as a compact currency string (e.g. 4000 -> "$40/hr"). */
export function fmtRate(cents: number): string {
  return `$${(cents / 100).toFixed(0)}/hr`;
}

/** Percent-style formatting for 0-1 factor values. */
export function fmtPct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

export function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${ms} ms`;
}

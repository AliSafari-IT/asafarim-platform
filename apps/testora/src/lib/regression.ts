/**
 * Regression detection (issue #261) — pure: a case that passed on the
 * previous stored run and fails on this one, distinct from a case that has
 * never passed (that's just a still-failing case, not a regression).
 */
export function isRegression(previousStatus: string | null, currentStatus: string): boolean {
  return previousStatus === "passed" && (currentStatus === "failed" || currentStatus === "error");
}

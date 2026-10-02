/**
 * Run scope ↔ project (#712). Access, targets, secrets and ownership are all
 * checked against the run's `projectId`, so every fixture the plan loaded —
 * by fixture/suite/requirement id or an explicit case selection — must belong
 * to that project. Otherwise a viewer of app A could run app B's fixtures (a
 * locked one, or against A's target and secrets) by passing B's ids.
 */
export interface RunScopeRefusal {
  status: 404;
  body: { error: string; code: "RUN_SCOPE_NOT_IN_PROJECT" };
}

export function planScopeError(
  units: { projectId?: string | null; fixture: { fixtureId: string } }[],
  projectId: string,
): RunScopeRefusal | null {
  const foreign = units.filter((unit) => unit.projectId !== projectId);
  if (foreign.length === 0) return null;
  const mixed = foreign.length < units.length;
  return {
    status: 404,
    body: {
      code: "RUN_SCOPE_NOT_IN_PROJECT",
      // 404, not 403: don't confirm that another app's ids exist.
      error: mixed
        ? "This selection mixes tests from different apps — run each app's tests separately."
        : "No such tests in this app.",
    },
  };
}

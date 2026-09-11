import type { PendingScenarioState } from "@asafarim/testora-tasksai-contract";

/**
 * Pure helpers for TDD-gate provisioning (issue #262). No DB — exhaustively
 * unit-testable.
 */

/** States that are *excluded* from a green-light check (#263) by construction. */
const NON_BLOCKING_STATES: ReadonlySet<PendingScenarioState> = new Set([
  "pending",
  "authoring",
  "quarantined",
]);

/** Whether a scenario in this state counts toward a green-light's required
 *  clean-run set. A freshly-provisioned scaffold never blocks until promoted. */
export function isBlockingScenario(state: PendingScenarioState): boolean {
  return !NON_BLOCKING_STATES.has(state);
}

function slugSegment(input: string, maxLen: number): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return (slug || "x").slice(0, maxLen);
}

/** Deterministic ids so re-provisioning the same (provisionId, criterionRef)
 *  always resolves to the same case/fixture/suite/FR — no lookup needed. */
export function provisionFrId(provisionId: string): string {
  return `fr-prov-${slugSegment(provisionId, 40)}`;
}
export function provisionSuiteId(provisionId: string): string {
  return `suite-prov-${slugSegment(provisionId, 40)}`;
}
export function provisionFixtureId(provisionId: string): string {
  return `fx-prov-${slugSegment(provisionId, 40)}`;
}
export function scenarioCaseId(provisionId: string, criterionRef: string): string {
  return `scn-${slugSegment(provisionId, 20)}-${slugSegment(criterionRef, 30)}`;
}

/**
 * A TestCafe scripted-case body that always fails with the criterion text as
 * the message — "pending scenarios execute (and fail, as stubs)". No app
 * code is written; this is Testora-side scaffolding only.
 */
export function scaffoldScript(criterionText: string): string {
  const oneLine = criterionText.replace(/\s+/g, " ").trim().slice(0, 400);
  const escaped = oneLine.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return [
    "// TODO: implement this acceptance criterion.",
    `// ${oneLine}`,
    `await t.expect(false).ok('Scaffold — not yet implemented: ${escaped}');`,
  ].join("\n");
}

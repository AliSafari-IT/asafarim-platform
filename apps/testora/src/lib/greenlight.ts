import type { PendingScenarioState } from "@asafarim/testora-tasksai-contract";
import { isBlockingScenario } from "@/lib/provision";

/**
 * Pure green-light computation (issue #263). No DB or network — exhaustively
 * unit-testable. A provision's linked scenarios go green when every counted
 * (blocking, non-quarantined) scenario has passed its last `requiredRuns`
 * runs consecutively — which, definitionally, means zero flakes *within that
 * window* (a flake is a fail somewhere in the sample; an all-pass window has
 * none).
 */

export interface ResultOutcome {
  status: string;
}

/** How many of the most recent results (up to `cap`) are consecutively
 *  "passed", starting from the most recent. `results` must be ordered most
 *  recent first. */
export function consecutivePassCount(results: ResultOutcome[], cap: number): number {
  let n = 0;
  for (const r of results) {
    if (r.status !== "passed") break;
    n++;
    if (n >= cap) break;
  }
  return n;
}

export interface ScenarioStanding {
  scenarioId: string;
  criterionRef: string;
  state: PendingScenarioState;
  quarantined: boolean;
  /** the scenario's last N results, most recent first */
  recentResults: ResultOutcome[];
  /** whether the scenario's latest result has a buildable artifact bundle */
  hasCompleteArtifacts: boolean;
}

export interface GreenLightVerdict {
  verdict: "green" | "not_green";
  cleanRuns: number;
  flakeCount: number;
  artifactsComplete: boolean;
  reason?: string;
  /** scenarios actually counted toward the verdict (blocking, non-quarantined) */
  counted: ScenarioStanding[];
}

/**
 * `scenarios` is every scenario linked to the provision. Quarantined and
 * non-blocking (pending/authoring) scenarios are excluded from the count —
 * "removes it from the requirement rather than blocking forever" — but still
 * returned in full by the caller for the event payload.
 */
export function evaluateGreenLight(
  scenarios: ScenarioStanding[],
  requiredRuns: number,
): GreenLightVerdict {
  const counted = scenarios.filter((s) => isBlockingScenario(s.state) && !s.quarantined);

  if (counted.length === 0) {
    return {
      verdict: "not_green",
      cleanRuns: 0,
      flakeCount: 0,
      artifactsComplete: false,
      reason: "no promoted, non-quarantined scenarios linked yet",
      counted,
    };
  }

  const cleanCounts = counted.map((s) => consecutivePassCount(s.recentResults, requiredRuns));
  const cleanRuns = Math.min(...cleanCounts);
  // A scenario that hasn't reached a clean streak of `requiredRuns` has a
  // fail somewhere in its recent window — that's the flake/regression signal
  // this gate cares about, whether or not #260 separately flagged it.
  const flakeCount = cleanCounts.filter((n) => n < requiredRuns).length;
  const latestScenario = counted.every((s) => s.recentResults.length > 0);
  const artifactsComplete = latestScenario && counted.every((s) => s.hasCompleteArtifacts);

  const allClean = cleanRuns >= requiredRuns;
  const verdict = allClean && flakeCount === 0 && artifactsComplete ? "green" : "not_green";

  let reason: string | undefined;
  if (verdict === "not_green") {
    if (!allClean || flakeCount > 0) {
      reason = `${flakeCount} of ${counted.length} scenario(s) have not yet reached ${requiredRuns} consecutive clean runs`;
    } else if (!artifactsComplete) {
      reason = "artifacts incomplete on the latest run for at least one scenario";
    }
  }

  return { verdict, cleanRuns, flakeCount, artifactsComplete, reason, counted };
}

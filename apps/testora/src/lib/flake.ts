/**
 * Automatic flake detection (issue #260) — pure, DB-free so it is exhaustively
 * unit-testable. DB orchestration lives in `flake-service.ts`.
 */

/** How many recent results feed the pass-rate score. */
export const FLAKE_SAMPLE_SIZE = 10;

/** Minimum sample before auto-quarantine may act — avoids quarantining a
 *  case off a single unlucky run. */
export const MIN_SAMPLE_FOR_AUTO_QUARANTINE = 3;

export type TerminalStatus = "passed" | "failed" | "error";

export interface RunOutcome {
  runIndex: number | null;
  status: string;
}

/**
 * True when, ordered by runIndex, a repeat within the same run failed and a
 * later repeat of the same case passed — flaky without touching history.
 */
export function hasFailThenPass(results: RunOutcome[]): boolean {
  const ordered = [...results].sort((a, b) => (a.runIndex ?? 0) - (b.runIndex ?? 0));
  let sawFail = false;
  for (const r of ordered) {
    if (r.status === "failed" || r.status === "error") {
      sawFail = true;
    } else if (r.status === "passed" && sawFail) {
      return true;
    }
  }
  return false;
}

/** Pass rate over a set of terminal-status results, or null with no sample. */
export function computePassRate(statuses: string[]): { passRate: number | null; sampleSize: number } {
  const terminal = statuses.filter(
    (s): s is TerminalStatus => s === "passed" || s === "failed" || s === "error",
  );
  if (terminal.length === 0) return { passRate: null, sampleSize: 0 };
  const passed = terminal.filter((s) => s === "passed").length;
  return { passRate: passed / terminal.length, sampleSize: terminal.length };
}

/**
 * Flaky = a strictly-between-0-and-1 pass rate over >= 2 samples, OR a
 * fail-then-pass within the run just executed. A single-sample rate of 0 or 1
 * is not flaky — it's just a pass or a fail.
 */
export function isFlaky(
  passRate: number | null,
  sampleSize: number,
  failThenPassThisRun: boolean,
): boolean {
  if (failThenPassThisRun) return true;
  if (passRate === null || sampleSize < 2) return false;
  return passRate > 0 && passRate < 1;
}

export function shouldAutoQuarantine(opts: {
  autoQuarantineEnabled: boolean;
  alreadyQuarantined: boolean;
  flaky: boolean;
  sampleSize: number;
}): boolean {
  if (!opts.autoQuarantineEnabled || opts.alreadyQuarantined || !opts.flaky) return false;
  return opts.sampleSize >= MIN_SAMPLE_FOR_AUTO_QUARANTINE;
}

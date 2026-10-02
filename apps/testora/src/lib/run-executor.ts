import {
  executeFixture,
  type RunPlan,
} from "@/test-engine/executors/testExecutor";
import { toJsonReport } from "@/test-engine/formatters/resultFormatter";
import { appendLog, completeRun, failRun, runSignal, isRunFinished } from "@/test-engine/executors/runLog";
import type { FormattedReport } from "@/test-engine/types";
import { TargetPolicyError, assertRunnableTarget } from "@/lib/target-policy";
import { unitTargetsWeb } from "@/lib/web-target";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { targetSecrets } from "@/db/schema";
import { decryptToken } from "@/lib/crypto";
import { buildRunSpecEnv } from "@/lib/run-secrets";

/**
 * Executes an admitted run in this process (ADR 0004 step 1 keeps execution
 * in-process; step 2 moves it to the isolated runner). Started by the durable
 * queue (test-engine/executors/runLog.ts) — right after admission, or later
 * when a slot frees up, possibly after a restart — from the run's frozen job.
 */

type RunUnit = RunPlan["units"][number];

/** What a run needs to execute, frozen (encrypted) on the run row at admission. */
export interface RunJob {
  plan: RunPlan;
  env: RunEnv;
}

export async function runInBackground(
  runId: string,
  plan: RunPlan,
  env: RunEnv,
): Promise<void> {
  try {
    const totalCases = plan.units.reduce(
      (total, unit) => total + unit.cases.length,
      0,
    );
    appendLog(
      runId,
      `Starting run for ${plan.label} — ${plan.units.length} fixture(s), ${totalCases} case(s)...`,
    );
    if (env.baseUrl || env.apiUrl) {
      appendLog(
        runId,
        `Target${env.targetName ? ` "${env.targetName}"` : ""}: site ${env.baseUrl ?? "(default)"}${env.apiUrl ? `, API ${env.apiUrl}` : ""}${env.hubUrl ? `, Hub ${env.hubUrl}` : ""}`,
      );
    }

    if (Object.keys(env.secrets).length > 0) {
      appendLog(runId, `Target secrets: ${Object.keys(env.secrets).sort().join(", ")}`);
    }

    const signal = runSignal(runId);
    const reports: FormattedReport[] = [];
    const deprecated = new Set<string>();

    for (const unit of plan.units) {
      if (signal?.aborted) break;
      if (plan.units.length > 1) {
        appendLog(
          runId,
          `── Fixture: ${unit.fixture.title} (${unit.cases.length} case(s)) ──`,
        );
      }
      try {
        // Re-check the network policy right before the browser starts: the
        // admission check may be minutes old (queued run), and a fixture's own
        // URL (no override) hasn't been checked yet.
        await assertUnitTargets(unit, env.apiUrl, env.hubUrl);
        // Only the run's target secrets (for fixtures of the target's own app),
        // the run's values and — deprecated, seeded ASafariM apps only — their
        // server-env credentials. Never the rest of process.env.
        const specEnv = buildRunSpecEnv({
          projectId: unit.projectId,
          targetSecrets: unit.projectId === env.secretsProjectId ? env.secrets : {},
          runValues: {},
          serverEnv: process.env,
        });
        for (const name of specEnv.deprecatedFallback) {
          if (!deprecated.has(name)) {
            deprecated.add(name);
            appendLog(
              runId,
              `⚠ Deprecated: ${name} came from the server environment — store it as a target secret instead.`,
            );
          }
        }
        reports.push(...(await runUnitWithRetry(runId, unit, signal, env, specEnv.env)));
      } catch (error) {
        if (signal?.aborted) break;
        // A fixture that can't even start its browser shouldn't sink the whole
        // run — record its cases as errored and carry on to the next fixture.
        const message =
          error instanceof Error ? error.message : "Fixture failed to run";
        appendLog(
          runId,
          `✖ Fixture "${unit.fixture.title}" could not run: ${message}`,
        );
        reports.push(...errorReports(unit, message));
      }
    }

    appendLog(runId, `Run complete: ${reports.length} case(s) executed.`);
    await completeRun(runId, reports);
  } catch (error) {
    if (!isRunFinished(runId)) {
      await failRun(runId, error instanceof Error ? error.message : "Run failed");
    }
  }
}

export interface RunEnv {
  baseUrl?: string;
  apiUrl?: string;
  hubUrl?: string;
  targetName?: string;
  /** Decrypted secrets of the run's target. */
  secrets: Record<string, string>;
  /** The project those secrets belong to — they only reach that app's fixtures. */
  secretsProjectId: string;
}

/** A target's secrets, decrypted (rows that fail to decrypt are skipped). */
export async function loadTargetSecrets(targetId: string): Promise<Record<string, string>> {
  const rows = await db
    .select({ name: targetSecrets.name, valueEnc: targetSecrets.valueEnc })
    .from(targetSecrets)
    .where(eq(targetSecrets.targetId, targetId));
  const out: Record<string, string> = {};
  for (const row of rows) {
    const value = decryptToken(row.valueEnc);
    if (value !== null) out[row.name] = value;
  }
  return out;
}

/** Throws (TargetPolicyError) when a fixture's page or API origin is not runnable. */
async function assertUnitTargets(
  unit: RunUnit,
  apiUrl: string | undefined,
  hubUrl: string | undefined,
): Promise<void> {
  for (const url of [unit.fixture.baseUrl, apiUrl, hubUrl]) {
    // Relative/empty URLs resolve against an origin that was already checked.
    if (!url || !/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
    try {
      await assertRunnableTarget(url, { isAdmin: true, stored: true });
    } catch (error) {
      if (error instanceof TargetPolicyError) {
        throw new Error(`Blocked by the target policy — ${error.message}`);
      }
      throw error;
    }
  }
}

// Browser launch is the flaky step (esp. when many fixtures run in sequence in
// the dev server). Retry once on a connection/launch failure with a short pause.
async function runUnitWithRetry(
  runId: string,
  unit: RunPlan["units"][number],
  signal: AbortSignal | undefined,
  env: { apiUrl?: string; hubUrl?: string },
  secretEnv: Record<string, string>,
): Promise<FormattedReport[]> {
  const maxAttempts = 2;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const results = await executeFixture(unit.fixture, unit.cases, {
        onLog: (line) => appendLog(runId, line),
        signal,
        // Scoped to this run's spec — concurrent runs share this process.
        apiUrl: env.apiUrl,
        hubUrl: env.hubUrl,
        // Creating accounts (sign-up fallbacks) only against local targets.
        allowSignup: !unitTargetsWeb(unit, env.apiUrl),
        secretEnv,
      });
      return toJsonReport(unit.suiteTitle, unit.fixture, unit.cases, results);
    } catch (error) {
      if (signal?.aborted) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const launchFailed =
        /establish.*browser connection|browser connection|unable to establish|browser disconnected/i.test(
          message,
        );
      if (launchFailed && attempt < maxAttempts) {
        appendLog(
          runId,
          `Browser did not start for "${unit.fixture.title}" (attempt ${attempt}/${maxAttempts}). Retrying...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 4000));
        continue;
      }
      throw error;
    }
  }
  return [];
}

// Synthesize error reports for a fixture whose browser never started, so the
// failure is visible in the results (and rerunnable via "rerun failed").
function errorReports(
  unit: RunPlan["units"][number],
  message: string,
): FormattedReport[] {
  return unit.cases.map((testCase) => ({
    suite: unit.suiteTitle,
    fixture: unit.fixture.title,
    fixtureId: unit.fixture.fixtureId,
    caseId: testCase.caseId,
    case: testCase.title,
    status: "error" as const,
    details: { errorMessage: message },
  }));
}

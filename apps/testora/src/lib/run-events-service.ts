import "server-only";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { RegressionDetectedData, RunCompletedData } from "@asafarim/testora-tasksai-contract";
import { db } from "@/db/client";
import { testCases, testFixtures, testResults } from "@/db/schema";
import type { TestRunResult } from "@/test-engine/types";
import { isRegression } from "@/lib/regression";
import { enqueueOutboundEvent } from "@/lib/outbound-events";
import { DEFAULT_PUBLIC_URL, bundleRef } from "@/lib/bundle-ref";

/**
 * Regression detection + run.completed summary (issue #261). Called after
 * persistResults, alongside flake detection. Best-effort throughout — a
 * bookkeeping failure never fails the run itself.
 */
export async function updateRegressionStateForRun(
  results: TestRunResult[],
  baseUrl: string = DEFAULT_PUBLIC_URL,
): Promise<void> {
  const caseIds = [...new Set(results.map((r) => r.caseId))];
  for (const caseId of caseIds) {
    try {
      await checkRegressionForCase(
        caseId,
        results.filter((r) => r.caseId === caseId),
        baseUrl,
      );
    } catch {
      // one case's regression check must never block another's
    }
  }
}

async function checkRegressionForCase(
  caseId: string,
  thisRunResults: TestRunResult[],
  baseUrl: string,
): Promise<void> {
  const sorted = [...thisRunResults].sort((a, b) => (a.runIndex ?? 0) - (b.runIndex ?? 0));
  const current = sorted[sorted.length - 1];
  if (!current) return;

  const earliestThisRun = sorted.reduce(
    (min, r) => (r.createdAt < min ? r.createdAt : min),
    sorted[0]!.createdAt,
  );

  const previous = await db.query.testResults.findFirst({
    where: and(eq(testResults.caseId, caseId), lt(testResults.createdAt, new Date(earliestThisRun))),
    orderBy: desc(testResults.createdAt),
    columns: { id: true, status: true, createdAt: true },
  });

  if (!isRegression(previous?.status ?? null, current.status)) return;

  const caseRow = await db.query.testCases.findFirst({
    where: eq(testCases.caseId, caseId),
    with: { fixture: { with: { suite: { with: { functionalRequirement: true } } } } },
  });
  const projectId = caseRow?.fixture?.suite?.functionalRequirement?.projectId;
  if (!projectId || !caseRow) return;

  // How many consecutive failed/error runs since the last pass — capped so
  // a long-broken case doesn't scan unbounded history for one counter.
  const failsSince = await db.query.testResults.findMany({
    where: and(
      eq(testResults.caseId, caseId),
      gt(testResults.createdAt, previous!.createdAt),
      inArray(testResults.status, ["failed", "error"]),
    ),
    columns: { id: true },
    limit: 200,
  });

  const payload = RegressionDetectedData.parse({
    scenarioId: caseId,
    scenarioTitle: caseRow.title,
    appId: projectId,
    previousStatus: "passed",
    runsSinceLastPass: Math.max(1, failsSince.length),
    bundle: bundleRef(current.id, baseUrl),
  });

  await enqueueOutboundEvent({ projectId, eventType: "regression.detected", payload });
}

/** One run.completed summary per fixture execution. */
export async function enqueueRunCompleted(
  results: TestRunResult[],
  fixtureId: string,
  baseUrl: string = DEFAULT_PUBLIC_URL,
): Promise<void> {
  if (results.length === 0) return;
  try {
    const fixtureRow = await db.query.testFixtures.findFirst({
      where: eq(testFixtures.fixtureId, fixtureId),
      with: { suite: { with: { functionalRequirement: true } } },
    });
    const projectId = fixtureRow?.suite?.functionalRequirement?.projectId;
    if (!projectId) return;

    const total = results.length;
    const passed = results.filter((r) => r.status === "passed").length;
    const failedResults = results.filter((r) => r.status === "failed" || r.status === "error");

    const payload = RunCompletedData.parse({
      runId: results[0]!.id,
      appId: projectId,
      total,
      passed,
      failed: failedResults.length,
      // A per-case flaky tally would need the same history scan as
      // flake-service; left at 0 for v1 — flake.detected already carries
      // the signal TasksAI needs, this is a run-level summary.
      flaky: 0,
      failedScenarios: failedResults
        .slice(0, 50)
        .map((r) => ({ scenarioId: r.caseId, bundle: bundleRef(r.id, baseUrl) })),
    });

    await enqueueOutboundEvent({ projectId, eventType: "run.completed", payload });
  } catch {
    // never fail the run over a summary event
  }
}

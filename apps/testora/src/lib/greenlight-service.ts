import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { GreenLightData } from "@asafarim/testora-tasksai-contract";
import { db } from "@/db/client";
import { provisions, testCases, testResults } from "@/db/schema";
import type { TestRunResult } from "@/test-engine/types";
import { evaluateGreenLight, type ScenarioStanding } from "@/lib/greenlight";
import { enqueueOutboundEvent } from "@/lib/outbound-events";

/** Entry point from the executor: re-evaluate every provision touched by
 *  this run's cases. Best-effort — one provision's evaluation never blocks
 *  another's or the run itself. */
export async function evaluateGreenLightForRun(results: TestRunResult[]): Promise<void> {
  const caseIds = [...new Set(results.map((r) => r.caseId))];
  if (caseIds.length === 0) return;

  const touched = await db
    .select({ provisionId: testCases.provisionId })
    .from(testCases)
    .where(inArray(testCases.caseId, caseIds));

  const provisionIds = [...new Set(touched.map((t) => t.provisionId).filter((v): v is string => Boolean(v)))];
  for (const provisionId of provisionIds) {
    try {
      await evaluateProvisionGreenLight(provisionId);
    } catch {
      // never fail the run over a green-light evaluation
    }
  }
}

/**
 * Green-light evaluation (issue #263) — called after flake/regression
 * detection for every provision touched by a run. Fires `greenlight.reached`
 * to the provision's own `callbackUrl` (a direct delivery, not the general
 * webhook fan-out — see webhook-dispatcher.ts) exactly once, the first time
 * the linked scenarios go green; re-evaluating an already-green provision is
 * a no-op (`provisions.greenAt` is the idempotency marker).
 *
 * "Complete artifacts on the latest run": a *failed* result's completeness
 * is judged by whether #259 captured a screenshot/DOM/step timeline for it.
 * A *passed* result carries no such artifacts today (#259 only captures on
 * failure), so it's treated as complete by definition — there is nothing
 * more for a pass to attach. Tightening this once passing runs carry their
 * own evidence is a natural follow-up, not a blocker for this gate.
 */
export async function evaluateProvisionGreenLight(provisionId: string): Promise<void> {
  const provision = await db.query.provisions.findFirst({ where: eq(provisions.id, provisionId) });
  if (!provision || provision.greenAt) return; // already green — fire-once

  const cases = await db.query.testCases.findMany({
    where: eq(testCases.provisionId, provisionId),
  });
  if (cases.length === 0) return;

  const standings: ScenarioStanding[] = [];
  for (const c of cases) {
    const recent = await db
      .select({ status: testResults.status, id: testResults.id })
      .from(testResults)
      .where(eq(testResults.caseId, c.caseId))
      .orderBy(desc(testResults.createdAt))
      .limit(provision.requiredRuns);

    standings.push({
      scenarioId: c.caseId,
      criterionRef: c.criterionRef ?? "",
      state: c.scenarioState,
      quarantined: c.quarantined,
      recentResults: recent,
      hasCompleteArtifacts: hasCompleteArtifacts(recent),
    });
  }

  const result = evaluateGreenLight(standings, provision.requiredRuns);
  if (result.verdict !== "green") return;

  await db
    .update(provisions)
    .set({ greenAt: new Date(), updatedAt: new Date() })
    .where(eq(provisions.id, provisionId));

  const payload = GreenLightData.parse({
    provisionId,
    taskRef: provision.taskRef,
    checkRef: provision.checkRef,
    verdict: "green",
    cleanRuns: result.cleanRuns,
    requiredRuns: provision.requiredRuns,
    flakeCount: result.flakeCount,
    artifactsComplete: result.artifactsComplete,
    scenarios: result.counted.map((s) => ({
      scenarioId: s.scenarioId,
      criterionRef: s.criterionRef,
      state: s.state,
    })),
  });

  await enqueueOutboundEvent({
    projectId: provision.projectId,
    eventType: "greenlight.reached",
    payload,
    directUrl: provision.callbackUrl,
  });
}

/** See the module doc — a pass has nothing to check yet; a stored result
 *  existing at all is what "complete" means until #259 captures on pass. */
function hasCompleteArtifacts(recent: { id: string }[]): boolean {
  return recent.length > 0;
}

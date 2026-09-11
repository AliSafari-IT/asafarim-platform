import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { outboundEvents, testCases, testResults } from "@/db/schema";
import type { TestRunResult } from "@/test-engine/types";
import {
  FLAKE_SAMPLE_SIZE,
  computePassRate,
  hasFailThenPass,
  isFlaky,
  shouldAutoQuarantine,
} from "@/lib/flake";

const DEFAULT_PUBLIC_URL = process.env.TESTORA_PUBLIC_URL ?? "http://localhost:3005";

function bundleRef(resultId: string, baseUrl: string) {
  // bundleId is a fresh identifier here, not a lookup key — the bundle API
  // mints the actual bundle (and its own bundleId) on read, from `url`.
  return { bundleId: randomUUID(), url: `${baseUrl.replace(/\/+$/, "")}/api/results/${resultId}/bundle` };
}

/**
 * Recomputes flakiness for every case touched by a just-persisted run, and
 * — for a case newly found flaky — updates flakeScore/lastFlakeAt, applies
 * auto-quarantine when the project has opted in, and enqueues a
 * `flake.detected` outbound event (issue #260; #261 delivers it).
 *
 * Called after `persistResults()` so the just-inserted rows are already part
 * of history. Best-effort per case: one case's failure to update never
 * blocks another's.
 */
export async function updateFlakeStateForRun(
  results: TestRunResult[],
  baseUrl: string = DEFAULT_PUBLIC_URL,
): Promise<void> {
  const caseIds = [...new Set(results.map((r) => r.caseId))];
  for (const caseId of caseIds) {
    try {
      await updateFlakeStateForCase(
        caseId,
        results.filter((r) => r.caseId === caseId),
        baseUrl,
      );
    } catch {
      // A single case's flake bookkeeping must never fail the run itself.
    }
  }
}

async function updateFlakeStateForCase(
  caseId: string,
  thisRunResults: TestRunResult[],
  baseUrl: string,
): Promise<void> {
  const caseRow = await db.query.testCases.findFirst({
    where: eq(testCases.caseId, caseId),
    with: {
      fixture: { with: { suite: { with: { functionalRequirement: true } } } },
    },
  });
  if (!caseRow) return;

  const projectId = caseRow.fixture?.suite?.functionalRequirement?.projectId;
  if (!projectId) return;

  const project = await db.query.projects.findFirst({ where: (p, { eq }) => eq(p.id, projectId) });

  const history = await db
    .select({ status: testResults.status })
    .from(testResults)
    .where(eq(testResults.caseId, caseId))
    .orderBy(desc(testResults.createdAt))
    .limit(FLAKE_SAMPLE_SIZE);

  const { passRate, sampleSize } = computePassRate(history.map((h) => h.status));
  const thisRunFlaky = hasFailThenPass(
    thisRunResults.map((r) => ({ runIndex: r.runIndex, status: r.status })),
  );
  const flaky = isFlaky(passRate, sampleSize, thisRunFlaky);

  const autoQuarantine = shouldAutoQuarantine({
    autoQuarantineEnabled: project?.autoQuarantineFlaky ?? false,
    alreadyQuarantined: caseRow.quarantined,
    flaky,
    sampleSize,
  });

  await db
    .update(testCases)
    .set({
      flakeScore: passRate,
      ...(flaky ? { lastFlakeAt: new Date() } : {}),
      ...(autoQuarantine
        ? { quarantined: true, quarantinedAt: new Date(), quarantineReason: "auto" as const }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(testCases.caseId, caseId));

  if (!flaky) return;

  const [lastFail, lastPass] = await Promise.all([
    db.query.testResults.findFirst({
      where: and(eq(testResults.caseId, caseId), inArray(testResults.status, ["failed", "error"])),
      orderBy: desc(testResults.createdAt),
      columns: { id: true },
    }),
    db.query.testResults.findFirst({
      where: and(eq(testResults.caseId, caseId), eq(testResults.status, "passed")),
      orderBy: desc(testResults.createdAt),
      columns: { id: true },
    }),
  ]);

  await db.insert(outboundEvents).values({
    id: randomUUID(),
    projectId,
    eventType: "flake.detected",
    payload: {
      scenarioId: caseId,
      scenarioTitle: caseRow.title,
      appId: projectId,
      passRate: passRate ?? 0,
      sampleSize,
      quarantined: autoQuarantine || caseRow.quarantined,
      ...(lastFail ? { bundle: bundleRef(lastFail.id, baseUrl) } : {}),
      ...(lastPass ? { passRunBundle: bundleRef(lastPass.id, baseUrl) } : {}),
    },
  });
}

/** Manual (un)quarantine — always available, always wins over auto-quarantine. */
export async function setCaseQuarantine(caseId: string, quarantined: boolean) {
  const [updated] = await db
    .update(testCases)
    .set({
      quarantined,
      quarantinedAt: quarantined ? new Date() : null,
      quarantineReason: quarantined ? ("manual" as const) : null,
      updatedAt: new Date(),
    })
    .where(eq(testCases.caseId, caseId))
    .returning();
  return updated;
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { jobForLease, readJob, runnerAuthError } from "@/lib/runner-routes";
import { errorReports } from "@/lib/run-executor";
import { finishRemote } from "@/test-engine/executors/runLog";
import { recordFixtureResults } from "@/test-engine/executors/testExecutor";
import { toJsonReport } from "@/test-engine/formatters/resultFormatter";
import { artifactStorageKey, type ArtifactKind } from "@/test-engine/artifact-timeline";
import type { FormattedReport, TestRunResult } from "@/test-engine/types";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const resultSchema = z.object({
  id: z.string().regex(UUID),
  caseId: z.string(),
  status: z.enum(["passed", "failed", "error"]),
  runIndex: z.number().int().nullable(),
  durationMs: z.number().nullable(),
  details: z.record(z.unknown()),
  errorMessage: z.string().max(8000).nullable(),
  createdAt: z.string(),
});

const bodySchema = z.object({
  status: z.enum(["completed", "error", "cancelled"]),
  error: z.string().max(2000).optional(),
  units: z.array(z.object({ fixtureId: z.string(), results: z.array(resultSchema).max(5000) })).max(500),
});

/** Keep only artifact refs that point at this result's own keys. */
function ownArtifactRefs(result: TestRunResult): TestRunResult {
  const refs = result.details.artifactRefs as Record<string, { key?: unknown }> | undefined;
  if (!refs) return result;
  const kept = Object.fromEntries(
    Object.entries(refs).filter(
      ([kind, ref]) => ref && ref.key === artifactStorageKey(result.id, kind as ArtifactKind),
    ),
  );
  return { ...result, details: { ...result.details, artifactRefs: kept } };
}

/**
 * POST /internal/runner/jobs/:id/complete — the runner's final word (#717).
 * Results are filtered to the job's own cases (the runner can't write into
 * other cases), stored with the usual post-run hooks, and the reports the
 * client sees are rebuilt here from them — not taken from the runner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rawBody = await request.text();
  const denied = runnerAuthError(request, rawBody, id);
  if (denied) return denied;
  const row = await jobForLease(request, id);
  if (row instanceof NextResponse) return row;

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(JSON.parse(rawBody));
  } catch {
    return NextResponse.json({ error: "bad_complete" }, { status: 400 });
  }
  const job = readJob(row);
  if (!job) {
    await finishRemote(id, { error: "This run's job could not be read" });
    return NextResponse.json({ ok: true });
  }

  if (body.status === "error") {
    await finishRemote(id, { error: body.error || "The runner reported an error" });
    return NextResponse.json({ ok: true });
  }

  const byFixture = new Map(body.units.map((unit) => [unit.fixtureId, unit.results]));
  const reports: FormattedReport[] = [];
  for (const unit of job.plan.units) {
    const caseIds = new Set(unit.cases.map((c) => c.caseId));
    const results = (byFixture.get(unit.fixture.fixtureId) ?? [])
      .filter((r) => caseIds.has(r.caseId))
      .map((r) => ownArtifactRefs(r as TestRunResult));
    if (results.length === 0) {
      reports.push(...errorReports(unit, body.status === "cancelled" ? "Run cancelled" : "This fixture did not run"));
      continue;
    }
    await recordFixtureResults(results, unit.fixture.fixtureId);
    reports.push(...toJsonReport(unit.suiteTitle, unit.fixture, unit.cases, results));
  }
  await finishRemote(id, { result: reports });
  return NextResponse.json({ ok: true });
}

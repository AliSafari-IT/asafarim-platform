import { NextResponse } from "next/server";
import { LEASE_DELIVERY_ID, RUNNER_ID_HEADER, newLeaseToken } from "@/lib/runner-auth";
import { buildRunnerEnvelope } from "@/lib/runner-envelope";
import { assertUnitTargets } from "@/lib/run-executor";
import { readJob, runnerAuthError } from "@/lib/runner-routes";
import {
  appendLog,
  finishRemote,
  maxRunMs,
  noteRunStarted,
  runStore,
  runnerMode,
} from "@/test-engine/executors/runLog";
import { TargetPolicyError } from "@/lib/target-policy";

export const dynamic = "force-dynamic";

/** Long-poll ceiling (ADR 0004 §2: ≤ 25 s). */
const LONG_POLL_MS = 25_000;
const POLL_INTERVAL_MS = 1_000;
const MAX_ARTIFACT_BYTES = 50 * 1024 * 1024;

/**
 * POST /internal/runner/lease — the runner asks for its next job (#717).
 * Long-polls up to 25 s; answers the job envelope (with a per-job lease
 * token) or 204. Only in TESTORA_RUNNER_MODE=remote — otherwise 204 and the
 * runner backs off, so an idle worker:dev never competes with in-process runs.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();
  const denied = runnerAuthError(request, rawBody, LEASE_DELIVERY_ID);
  if (denied) return denied;
  if (runnerMode() !== "remote") {
    return new NextResponse(null, { status: 204, headers: { "x-testora-runner-mode": "inprocess" } });
  }

  const runnerId = (request.headers.get(RUNNER_ID_HEADER) ?? "unknown").replace(/[^\w.:-]/g, "").slice(0, 80);
  const owner = `runner:${runnerId}`;
  const deadline = Date.now() + LONG_POLL_MS;
  const store = runStore();

  while (Date.now() < deadline && !request.signal.aborted) {
    const lease = newLeaseToken();
    const row = await store.claimForRunner(owner, lease.hash);
    if (row) {
      const job = readJob(row);
      if (!job) {
        await finishRemote(row.id, { error: "This run's job could not be read (was TESTORA_SECRET changed?)" });
        continue;
      }
      noteRunStarted(row.id, row.queuedAt);
      appendLog(row.id, `Runner ${runnerId} took this run.`);

      // The per-fixture network policy check (#699) the in-process executor
      // does before each fixture — fixtures that fail it don't go out; the
      // complete call reports them as errored.
      const runnable = [];
      for (const unit of job.plan.units) {
        try {
          await assertUnitTargets(unit, job.env.apiUrl, job.env.hubUrl);
          runnable.push(unit);
        } catch (error) {
          const message = error instanceof TargetPolicyError || error instanceof Error ? error.message : String(error);
          appendLog(row.id, `✖ Fixture "${unit.fixture.title}" could not run: ${message}`);
        }
      }

      const { envelope, deprecatedFallback } = buildRunnerEnvelope({
        runId: row.id,
        leaseToken: lease.token,
        leaseExpiresAt: row.leaseExpiresAt ?? new Date(Date.now() + 30_000),
        job: { ...job, plan: { ...job.plan, units: runnable } },
        serverEnv: process.env,
        timeoutMs: maxRunMs(),
        maxArtifactBytes: MAX_ARTIFACT_BYTES,
      });
      for (const name of deprecatedFallback) {
        appendLog(row.id, `⚠ Deprecated: ${name} came from the server environment — store it as a target secret instead.`);
      }
      return NextResponse.json(envelope, { headers: { "cache-control": "no-store" } });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  return new NextResponse(null, { status: 204 });
}

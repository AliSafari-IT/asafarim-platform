import "server-only";
import { NextResponse } from "next/server";
import { decryptToken } from "@/lib/crypto";
import type { RunJob } from "@/lib/run-executor";
import { LEASE_TOKEN_HEADER, leaseTokenValid, runnerAuthConfig, verifyRunnerRequest } from "@/lib/runner-auth";
import { runStore } from "@/test-engine/executors/runLog";
import type { RunRow } from "@/test-engine/executors/runStore";

/** Shared plumbing for the /internal/runner/* routes (#717). */

/** Verify bearer + signature over `signedBody` for `jobId`; null when OK, else the response. */
export function runnerAuthError(request: Request, signedBody: string, jobId: string): NextResponse | null {
  const verdict = verifyRunnerRequest({
    headers: request.headers,
    rawBody: signedBody,
    jobId,
    config: runnerAuthConfig(),
  });
  if (verdict.ok) return null;
  return NextResponse.json({ error: verdict.reason }, { status: verdict.status });
}

/** The job, if the request's lease token is valid for it right now. */
export async function jobForLease(request: Request, jobId: string): Promise<RunRow | NextResponse> {
  const row = await runStore().get(jobId);
  if (!leaseTokenValid(request.headers.get(LEASE_TOKEN_HEADER), row)) {
    // Same answer for "no such job" and "not your job": don't leak which.
    return NextResponse.json({ error: "lease_invalid" }, { status: 403 });
  }
  return row!;
}

export function readJob(row: RunRow): RunJob | null {
  const raw = row.jobEnc ? decryptToken(row.jobEnc) : null;
  if (!raw) return null;
  try {
    return JSON.parse(raw) as RunJob;
  } catch {
    return null;
  }
}

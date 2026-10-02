import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import {
  DELIVERY_HEADER,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  signPayload,
  verifySignature,
} from "@asafarim/testora-tasksai-contract";

/**
 * Runner ↔ web authentication (#717, ADR 0004 §2). Every call to
 * /internal/runner/* carries:
 *   - `Authorization: Bearer <TESTORA_RUNNER_TOKEN>`;
 *   - an HMAC-SHA256 signature over `${timestamp}.${jobId}.${rawBody}` (the
 *     ADR 0002 helper: ±300 s window, constant-time, several secrets accepted
 *     for rotation — TESTORA_RUNNER_SIGNING_SECRETS, comma-separated; the
 *     runner signs with the first). The delivery id IS the job id ("lease" for
 *     the lease call), so a signature can't be replayed against another job;
 *   - for a job's events/artifacts/complete calls, the per-job lease token
 *     handed out with the envelope (`x-testora-lease-token`), stored only as
 *     a sha256 hash and valid only for that job while its lease holds.
 * Pure (no DB) so it can be unit-tested; the routes look up the job's hash.
 */

export const LEASE_TOKEN_HEADER = "x-testora-lease-token";
export const RUNNER_ID_HEADER = "x-testora-runner-id";
export const LEASE_DELIVERY_ID = "lease";

export interface RunnerAuthConfig {
  token: string | null;
  signingSecrets: string[];
}

export function runnerAuthConfig(env: Record<string, string | undefined> = process.env): RunnerAuthConfig {
  return {
    token: env.TESTORA_RUNNER_TOKEN?.trim() || null,
    signingSecrets: (env.TESTORA_RUNNER_SIGNING_SECRETS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export type RunnerAuthResult = { ok: true } | { ok: false; status: 401 | 503; reason: string };

/** Check the bearer token and the body signature for a call about `jobId`. */
export function verifyRunnerRequest(input: {
  headers: Headers;
  rawBody: string;
  jobId: string;
  config: RunnerAuthConfig;
  /** unix seconds (tests) */
  now?: number;
}): RunnerAuthResult {
  const { config, headers } = input;
  if (!config.token || config.signingSecrets.length === 0) {
    return { ok: false, status: 503, reason: "runner_disabled" };
  }
  const bearer = /^Bearer\s+(.+)$/i.exec((headers.get("authorization") ?? "").trim())?.[1];
  if (!bearer || !safeEqual(bearer, config.token)) {
    return { ok: false, status: 401, reason: "bad_token" };
  }
  const deliveryId = headers.get(DELIVERY_HEADER);
  if (deliveryId !== input.jobId) {
    return { ok: false, status: 401, reason: "job_mismatch" };
  }
  const verdict = verifySignature({
    secret: config.signingSecrets,
    rawBody: input.rawBody,
    signature: headers.get(SIGNATURE_HEADER),
    timestamp: headers.get(TIMESTAMP_HEADER),
    deliveryId,
    now: input.now,
  });
  return verdict.ok ? { ok: true } : { ok: false, status: 401, reason: verdict.reason };
}

/** Headers the runner sends (bearer + signature for `jobId`, + lease token). */
export function runnerRequestHeaders(input: {
  token: string;
  secret: string;
  jobId: string;
  rawBody: string;
  leaseToken?: string;
  runnerId?: string;
  timestamp?: number;
}): Record<string, string> {
  const signed = signPayload({
    secret: input.secret,
    rawBody: input.rawBody,
    deliveryId: input.jobId,
    timestamp: input.timestamp,
  });
  return {
    authorization: `Bearer ${input.token}`,
    ...signed.headers,
    ...(input.leaseToken ? { [LEASE_TOKEN_HEADER]: input.leaseToken } : {}),
    ...(input.runnerId ? { [RUNNER_ID_HEADER]: input.runnerId } : {}),
  };
}

export function hashLeaseToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function newLeaseToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashLeaseToken(token) };
}

/** Whether the presented lease token belongs to this job's live lease. */
export function leaseTokenValid(
  presented: string | null,
  job: { runnerLeaseTokenHash: string | null; leaseExpiresAt: Date | null; status: string } | null,
  now: Date = new Date(),
): boolean {
  if (!presented || !job?.runnerLeaseTokenHash) return false;
  if (job.status !== "running" || !job.leaseExpiresAt || job.leaseExpiresAt <= now) return false;
  return safeEqual(hashLeaseToken(presented), job.runnerLeaseTokenHash);
}

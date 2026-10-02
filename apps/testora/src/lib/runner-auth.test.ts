import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEASE_DELIVERY_ID,
  hashLeaseToken,
  leaseTokenValid,
  newLeaseToken,
  runnerAuthConfig,
  runnerRequestHeaders,
  verifyRunnerRequest,
} from "./runner-auth";
import { isServiceRequest } from "./access-policy";

const config = runnerAuthConfig({
  TESTORA_RUNNER_TOKEN: "runner-token",
  TESTORA_RUNNER_SIGNING_SECRETS: "current-secret, previous-secret",
});
const NOW = 1_790_000_000;

function request(opts: { jobId: string; body: string; secret?: string; token?: string; timestamp?: number; signedJobId?: string }) {
  return new Headers(
    runnerRequestHeaders({
      token: opts.token ?? "runner-token",
      secret: opts.secret ?? "current-secret",
      jobId: opts.signedJobId ?? opts.jobId,
      rawBody: opts.body,
      timestamp: opts.timestamp ?? NOW,
    }),
  );
}

const verify = (headers: Headers, jobId: string, rawBody: string, now = NOW) =>
  verifyRunnerRequest({ headers, rawBody, jobId, config, now });

test("a correctly signed call verifies", () => {
  assert.deepEqual(verify(request({ jobId: "job-1", body: '{"a":1}' }), "job-1", '{"a":1}'), { ok: true });
  assert.deepEqual(verify(request({ jobId: LEASE_DELIVERY_ID, body: "{}" }), LEASE_DELIVERY_ID, "{}"), { ok: true });
});

test("HMAC window: ±300 s around the timestamp", () => {
  const body = "{}";
  assert.equal(verify(request({ jobId: "j", body, timestamp: NOW - 299 }), "j", body).ok, true);
  assert.equal(verify(request({ jobId: "j", body, timestamp: NOW + 299 }), "j", body).ok, true);
  for (const ts of [NOW - 301, NOW + 301]) {
    const result = verify(request({ jobId: "j", body, timestamp: ts }), "j", body);
    assert.deepEqual(result, { ok: false, status: 401, reason: "timestamp_out_of_window" });
  }
});

test("HMAC rotation: the previous secret still verifies, an unknown one doesn't", () => {
  assert.equal(verify(request({ jobId: "j", body: "{}", secret: "previous-secret" }), "j", "{}").ok, true);
  assert.deepEqual(verify(request({ jobId: "j", body: "{}", secret: "stolen" }), "j", "{}"), {
    ok: false,
    status: 401,
    reason: "signature_mismatch",
  });
});

test("tampering: a changed body, job id or token is refused", () => {
  const headers = request({ jobId: "job-1", body: '{"events":[]}' });
  assert.equal(verify(headers, "job-1", '{"events":[{"kind":"log","line":"x"}]}').ok, false, "body changed");
  assert.deepEqual(verify(headers, "job-2", '{"events":[]}'), { ok: false, status: 401, reason: "job_mismatch" });
  // A signature for job-1 presented as job-2 (delivery id rewritten) fails the HMAC.
  const forged = request({ jobId: "job-1", body: "{}" });
  forged.set("x-asafarim-delivery", "job-2");
  assert.deepEqual(verify(forged, "job-2", "{}"), { ok: false, status: 401, reason: "signature_mismatch" });
  assert.deepEqual(verify(request({ jobId: "j", body: "{}", token: "wrong" }), "j", "{}"), {
    ok: false,
    status: 401,
    reason: "bad_token",
  });
});

test("the runner is disabled until both the token and a signing secret are set", () => {
  const off = runnerAuthConfig({ TESTORA_RUNNER_TOKEN: "t" });
  const result = verifyRunnerRequest({ headers: request({ jobId: "j", body: "{}" }), rawBody: "{}", jobId: "j", config: off, now: NOW });
  assert.deepEqual(result, { ok: false, status: 503, reason: "runner_disabled" });
});

test("lease-token scoping: one job's token is rejected on another job, and after expiry", () => {
  const a = newLeaseToken();
  const b = newLeaseToken();
  const future = new Date(Date.now() + 30_000);
  const jobA = { runnerLeaseTokenHash: a.hash, leaseExpiresAt: future, status: "running" };
  const jobB = { runnerLeaseTokenHash: b.hash, leaseExpiresAt: future, status: "running" };
  assert.equal(leaseTokenValid(a.token, jobA), true);
  assert.equal(leaseTokenValid(a.token, jobB), false, "A's token on job B");
  assert.equal(leaseTokenValid(b.token, jobA), false, "B's token on job A");
  assert.equal(leaseTokenValid(a.token, { ...jobA, leaseExpiresAt: new Date(Date.now() - 1) }), false, "expired lease");
  assert.equal(leaseTokenValid(a.token, { ...jobA, status: "done" }), false, "finished job");
  assert.equal(leaseTokenValid(null, jobA), false);
  assert.equal(leaseTokenValid(a.token, null), false);
  // Only the hash is stored.
  assert.equal(hashLeaseToken(a.token), a.hash);
  assert.notEqual(a.hash, a.token);
});

test("the runner routes bypass the session gate (their own auth applies) — nothing else under /internal", () => {
  assert.equal(isServiceRequest("POST", "/internal/runner/lease"), true);
  assert.equal(isServiceRequest("POST", "/internal/runner/jobs/j1/events"), true);
  assert.equal(isServiceRequest("POST", "/internal/runner/jobs/j1/complete"), true);
  assert.equal(isServiceRequest("PUT", "/internal/runner/jobs/j1/artifacts/screenshot/r1"), true);
  assert.equal(isServiceRequest("GET", "/internal/runner/lease"), false);
  assert.equal(isServiceRequest("POST", "/internal/runner/jobs/j1/other"), false);
  assert.equal(isServiceRequest("POST", "/internal/admin"), false);
});

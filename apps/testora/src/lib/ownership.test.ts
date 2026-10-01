import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  builtInUrlChangeError,
  checkOwnershipProof,
  checkRunOwnership,
  hostWithin,
  newVerificationToken,
  ownedDomain,
  verificationRecord,
  type OwnershipProject,
  type ProofDeps,
} from "./ownership";
import { RunRateLimiter, rateLimitKey, runsPerTargetPerHour } from "./run-rate-limit";
import { readCapped } from "./ownership-verify";
import { TESTORA_USER_AGENT, TESTORA_VERSION } from "./version";
import { generateTestSpec } from "@/test-engine/generators/testGenerator";

const exampleApp: OwnershipProject = { id: "example", seeded: false, baseUrl: "https://example.com", verifiedAt: null };
const asafarimApp: OwnershipProject = { id: "asafarim-edumatch", seeded: true, baseUrl: "https://edumatch.asafarim.com", verifiedAt: null };

// ── acceptance ────────────────────────────────────────────────────────────

test("running an unverified https://example.com app is refused with 403 'verify ownership'", () => {
  const refusal = checkRunOwnership(exampleApp, ["https://example.com/", "https://example.com/api"]);
  assert.equal(refusal?.status, 403);
  assert.equal(refusal?.body.code, "OWNERSHIP_UNVERIFIED");
  assert.match(refusal!.body.error, /Verify ownership of example\.com/);
});

test("once verified, the app's host and its subdomains run; other hosts don't", () => {
  const verified = { ...exampleApp, verifiedAt: new Date() };
  assert.equal(checkRunOwnership(verified, ["https://example.com/", "https://api.example.com/v1"]), null);
  const outside = checkRunOwnership(verified, ["https://example.com/", "https://evil.example.org"]);
  assert.equal(outside?.body.code, "TARGET_OUTSIDE_VERIFIED_DOMAIN");
  // A look-alike suffix is not a subdomain.
  assert.equal(checkRunOwnership(verified, ["https://notexample.com"])?.body.code, "TARGET_OUTSIDE_VERIFIED_DOMAIN");
});

test("seeded ASafariM apps are pre-verified for asafarim.com", () => {
  assert.equal(ownedDomain(asafarimApp), "asafarim.com");
  assert.equal(checkRunOwnership(asafarimApp, ["https://edumatch.asafarim.com", "https://hub.asafarim.com"]), null);
  assert.equal(checkRunOwnership(asafarimApp, ["https://example.com"])?.body.code, "TARGET_OUTSIDE_VERIFIED_DOMAIN");
});

test("local targets never need proof", () => {
  assert.equal(checkRunOwnership(exampleApp, ["http://localhost:3009", "http://127.0.0.1:8080/api"]), null);
  assert.equal(checkRunOwnership(null, ["http://localhost:3009"]), null);
  // An unknown project with a web URL is refused.
  assert.equal(checkRunOwnership(null, ["https://example.com"])?.body.code, "OWNERSHIP_UNVERIFIED");
});

test("hostWithin is exact-or-subdomain", () => {
  assert.equal(hostWithin("a.b.example.com", "example.com"), true);
  assert.equal(hostWithin("example.com", "example.com"), true);
  assert.equal(hostWithin("badexample.com", "example.com"), false);
});

// ── the proof ─────────────────────────────────────────────────────────────

function deps(options: { wellKnown?: string; txt?: Record<string, string[][]> }): ProofDeps & { fetched: string[] } {
  const fetched: string[] = [];
  return {
    fetched,
    fetchText: async (url) => {
      fetched.push(url);
      if (options.wellKnown === undefined) throw new Error("HTTP 404");
      return options.wellKnown;
    },
    resolveTxt: async (name) => {
      const records = options.txt?.[name];
      if (!records) throw new Error("ENODATA");
      return records;
    },
  };
}

test("the proof is found at /.well-known/testora-verification", async () => {
  const token = newVerificationToken();
  assert.match(token, /^[0-9a-f]{32}$/);
  const d = deps({ wellKnown: `${verificationRecord(token)}\n` });
  const result = await checkOwnershipProof("example.com", token, d);
  assert.deepEqual([result.verified, result.method], [true, "well-known"]);
  assert.deepEqual(d.fetched, ["https://example.com/.well-known/testora-verification"]);
});

test("the proof is found in a DNS TXT record (prefixed name or the host)", async () => {
  const token = "abc123";
  for (const name of ["_testora-verification.example.com", "example.com"]) {
    const result = await checkOwnershipProof("example.com", token, deps({ txt: { [name]: [["testora-verification=", "abc123"]] } }));
    assert.deepEqual([result.verified, result.method], [true, "dns-txt"], name);
  }
});

test("a wrong or missing token does not verify, and says what was tried", async () => {
  const result = await checkOwnershipProof(
    "example.com",
    "abc123",
    deps({ wellKnown: "testora-verification=other", txt: { "example.com": [["v=spf1 -all"]] } }),
  );
  assert.equal(result.verified, false);
  assert.match(result.detail, /does not contain the token/);
  assert.match(result.detail, /no matching TXT record on example\.com/);
  // A token embedded in a longer word doesn't count.
  const partial = await checkOwnershipProof("example.com", "abc123", deps({ wellKnown: "xxabc123xx" }));
  assert.equal(partial.verified, false);
});

// ── rate limit ────────────────────────────────────────────────────────────

test("runs per target are capped per rolling hour", () => {
  const limiter = new RunRateLimiter(2, 60 * 60 * 1000);
  const t0 = 1_000_000;
  assert.equal(limiter.tryAcquire("target:a", t0).ok, true);
  assert.equal(limiter.tryAcquire("target:a", t0 + 1000).ok, true);
  const third = limiter.tryAcquire("target:a", t0 + 2000);
  assert.equal(third.ok, false);
  if (!third.ok) assert.equal(third.retryAfterSec, 3600 - 2);
  // Other targets are independent; the window rolls.
  assert.equal(limiter.tryAcquire("target:b", t0 + 2000).ok, true);
  assert.equal(limiter.tryAcquire("target:a", t0 + 60 * 60 * 1000 + 1).ok, true);
});

test("rate-limit key and configured limit", () => {
  assert.equal(rateLimitKey("asafarim-edumatch:remote", "https://x"), "target:asafarim-edumatch:remote");
  assert.equal(rateLimitKey(undefined, "https://example.com/a/b"), "origin:https://example.com");
  assert.equal(runsPerTargetPerHour({}), 30);
  assert.equal(runsPerTargetPerHour({ TESTORA_RUNS_PER_TARGET_PER_HOUR: "5" }), 5);
  assert.equal(runsPerTargetPerHour({ TESTORA_RUNS_PER_TARGET_PER_HOUR: "nope" }), 30);
});

// ── User-Agent ────────────────────────────────────────────────────────────

test("the User-Agent identifies Testora and matches package.json's version", () => {
  const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string };
  assert.equal(TESTORA_VERSION, pkg.version);
  assert.equal(TESTORA_USER_AGENT, `Testora/${pkg.version} (+https://testora.asafarim.com)`);
});

test("every generated spec sets the User-Agent on its fixture", () => {
  const spec = generateTestSpec(
    { fixtureId: "f", suiteId: "s", title: "T", baseUrl: "https://example.com", commonInput: {} },
    [{ caseId: "c", fixtureId: "f", title: "c", scriptType: "scripted", expected: {}, script: "" }],
  );
  assert.ok(spec.includes('import { RequestHook, Selector } from "testcafe";'));
  assert.ok(spec.includes(`event.requestOptions.headers["user-agent"] = ${JSON.stringify(TESTORA_USER_AGENT)}`));
  assert.match(spec, /fixture`T`\n {2}\.page\(`https:\/\/example\.com`\)\n {2}\.requestHooks\(__testoraUserAgent\)/);
});

// ── review fixes ──────────────────────────────────────────────────────────

test("a built-in app's exemption is anchored to the code registry, not its editable URL", () => {
  // An admin edited the built-in app's URL to someone else's site:
  const edited: OwnershipProject = { ...asafarimApp, baseUrl: "https://example.com" };
  assert.equal(ownedDomain(edited), "asafarim.com");
  assert.equal(checkRunOwnership(edited, ["https://example.com"])?.body.code, "TARGET_OUTSIDE_VERIFIED_DOMAIN");
  // A seeded row the registry no longer knows gets no exemption at all.
  assert.equal(ownedDomain({ ...asafarimApp, id: "retired-app" }), null);
});

test("a built-in app can't be moved off its own domain", () => {
  assert.match(builtInUrlChangeError("asafarim-edumatch", "https://example.com")!, /only point at asafarim\.com/);
  assert.equal(builtInUrlChangeError("asafarim-edumatch", "https://staging.edumatch.asafarim.com"), null);
  assert.equal(builtInUrlChangeError("asafarim-edumatch", ""), null);
});

test("the verification body is read with a hard byte cap, not buffered whole", async () => {
  let pulled = 0;
  const huge = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulled += 1;
      if (pulled > 10_000) return controller.close();
      controller.enqueue(new TextEncoder().encode("x".repeat(1024)));
    },
  });
  const text = await readCapped(new Response(huge), 4096);
  assert.equal(text.length, 4096);
  assert.ok(pulled < 20, `read ${pulled} chunks — the stream must be cancelled at the cap`);
  assert.equal(await readCapped(new Response("testora-verification=abc"), 4096), "testora-verification=abc");
});

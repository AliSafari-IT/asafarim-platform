import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEV_TESTORA_SECRET,
  MIN_TESTORA_SECRET_LENGTH,
  resolveTestoraSecret,
  testoraSecretProblem,
} from "./secret-config";

const STRONG = "x".repeat(MIN_TESTORA_SECRET_LENGTH);

test("production refuses a missing, default or short TESTORA_SECRET", () => {
  assert.match(testoraSecretProblem({ NODE_ENV: "production" })!, /not set/);
  assert.match(testoraSecretProblem({ NODE_ENV: "production", TESTORA_SECRET: "" })!, /not set/);
  assert.match(testoraSecretProblem({ NODE_ENV: "production", TESTORA_SECRET: DEV_TESTORA_SECRET })!, /dev default/);
  assert.match(testoraSecretProblem({ NODE_ENV: "production", TESTORA_SECRET: "x".repeat(31) })!, /shorter than 32/);
  assert.equal(testoraSecretProblem({ NODE_ENV: "production", TESTORA_SECRET: STRONG }), null);
  assert.throws(() => resolveTestoraSecret({ NODE_ENV: "production" }), /refusing to encrypt or decrypt/);
  assert.equal(resolveTestoraSecret({ NODE_ENV: "production", TESTORA_SECRET: STRONG }), STRONG);
});

test("development and test keep the dev default", () => {
  assert.equal(testoraSecretProblem({ NODE_ENV: "development" }), null);
  assert.equal(testoraSecretProblem({}), null);
  assert.equal(resolveTestoraSecret({ NODE_ENV: "test" }), DEV_TESTORA_SECRET);
});

/** Run `fn` with process.env temporarily changed. */
async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test("the production boot (instrumentation register) refuses a weak key", async () => {
  const { register } = await import("../instrumentation");
  for (const secret of [undefined, DEV_TESTORA_SECRET, "short"]) {
    await withEnv({ NODE_ENV: "production", NEXT_RUNTIME: "nodejs", TESTORA_SECRET: secret }, async () => {
      await assert.rejects(register(), /Testora refuses to start/);
    });
  }
});

test("encryption fails closed in production with a weak key", async () => {
  const { encryptToken } = await import("./crypto");
  await withEnv({ NODE_ENV: "production", TESTORA_SECRET: undefined }, async () => {
    assert.throws(() => encryptToken("value"), /TESTORA_SECRET is not set/);
  });
});

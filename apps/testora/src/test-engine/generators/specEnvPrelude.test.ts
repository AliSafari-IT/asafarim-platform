import assert from "node:assert/strict";
import { test } from "node:test";
import { specEnvPrelude } from "./testGenerator";

/** Evaluate spec code the way a generated spec sees it (prelude first). */
function evalWithPrelude(prelude: string, body: string): unknown {
  return new Function(`${prelude}\n${body}`)();
}

test("per-run values are visible to the spec without touching the global env", () => {
  const before = process.env.TESTORA_DOM_DIR;
  const prelude = specEnvPrelude({ TESTORA_DOM_DIR: "/tmp/run-a/dom", WEBAPP_API_URL: "https://api.a.test" });
  const seen = evalWithPrelude(prelude, "return [process.env.TESTORA_DOM_DIR, process.env.WEBAPP_API_URL];");
  assert.deepEqual(seen, ["/tmp/run-a/dom", "https://api.a.test"]);
  assert.equal(process.env.TESTORA_DOM_DIR, before, "global env must stay unchanged");
});

test("two runs' specs each see only their own values", () => {
  const a = specEnvPrelude({ TESTORA_DOM_DIR: "/tmp/a" });
  const b = specEnvPrelude({ TESTORA_DOM_DIR: "/tmp/b" });
  assert.equal(evalWithPrelude(a, "return process.env.TESTORA_DOM_DIR;"), "/tmp/a");
  assert.equal(evalWithPrelude(b, "return process.env.TESTORA_DOM_DIR;"), "/tmp/b");
});

test("the server's environment is hidden; the process API still works (#702)", () => {
  const before = process.env.TESTORA_TEST_SERVER_SECRET;
  process.env.TESTORA_TEST_SERVER_SECRET = "server-only-value";
  try {
    const prelude = specEnvPrelude({ TESTORA_DOM_DIR: "/tmp/x" });
    const [secret, path, cwd, platform, keys] = evalWithPrelude(
      prelude,
      "return [process.env.TESTORA_TEST_SERVER_SECRET, process.env.PATH, process.cwd(), process.platform, Object.keys(process.env)];",
    ) as [string | undefined, string | undefined, string, string, string[]];
    assert.equal(secret, undefined, "server env must not leak into the spec");
    assert.equal(path, undefined);
    assert.deepEqual(keys, ["TESTORA_DOM_DIR"]);
    assert.equal(cwd, process.cwd());
    assert.equal(platform, process.platform);
  } finally {
    if (before === undefined) delete process.env.TESTORA_TEST_SERVER_SECRET;
    else process.env.TESTORA_TEST_SERVER_SECRET = before;
  }
});

test("an empty env still gets a prelude, so the spec never sees the server env", () => {
  for (const env of [{}, { WEBAPP_API_URL: undefined }]) {
    const prelude = specEnvPrelude(env);
    assert.notEqual(prelude, "");
    assert.deepEqual(evalWithPrelude(prelude, "return Object.keys(process.env);"), []);
  }
});

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

test("the rest of the real environment and process API still work", () => {
  const prelude = specEnvPrelude({ TESTORA_DOM_DIR: "/tmp/x" });
  const [path, cwd, platform] = evalWithPrelude(
    prelude,
    "return [process.env.PATH, process.cwd(), process.platform];",
  ) as [string | undefined, string, string];
  assert.equal(path, process.env.PATH);
  assert.equal(cwd, process.cwd());
  assert.equal(platform, process.platform);
});

test("undefined values are skipped and an empty env adds no prelude", () => {
  assert.equal(specEnvPrelude({}), "");
  assert.equal(specEnvPrelude({ WEBAPP_API_URL: undefined }), "");
  const prelude = specEnvPrelude({ TESTORA_DOM_DIR: "/tmp/y", WEBAPP_API_URL: undefined });
  assert.equal(
    evalWithPrelude(prelude, "return process.env.WEBAPP_API_URL;"),
    process.env.WEBAPP_API_URL,
  );
});

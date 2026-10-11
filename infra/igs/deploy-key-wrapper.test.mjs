// igs-pharma.be automatic staging deploy (#833): infra/igs/deploy-key-wrapper.sh,
// the forced command of the deploy key, and the workflow that calls it.
//
// The wrapper runs a stub instead of igs-deploy.sh (IGS_DEPLOY_SCRIPT): the
// stub records its arguments, so each test shows whether a deploy ran and with
// what. Anything but one full 40-character lowercase hex SHA is refused before
// the stub runs.
//
// CI: .github/workflows/edge.yml.   node --test infra/igs/deploy-key-wrapper.test.mjs
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";

const repo = path.resolve(import.meta.dirname, "../..");
const WRAPPER = path.join(repo, "infra/igs/deploy-key-wrapper.sh");
const WORKFLOW = path.join(repo, ".github/workflows/igs-deploy.yml");
const scratch = mkdtempSync(path.join(tmpdir(), "igs-deploy-key-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const SHA = "0123456789abcdef0123456789abcdef01234567";
const calls = path.join(scratch, "calls");
const stub = path.join(scratch, "igs-deploy-stub.sh");
writeFileSync(
  stub,
  `#!/usr/bin/env bash\nprintf '%s\\n' "$#" "$@" >>"${calls}"\n[[ -z "\${STUB_SLEEP:-}" ]] || sleep "$STUB_SLEEP"\nexit "\${STUB_EXIT:-0}"\n`,
  { mode: 0o755 }
);

function env(extra = {}) {
  const e = {
    ...process.env,
    IGS_DEPLOY_SCRIPT: stub,
    IGS_DEPLOY_LOCK: path.join(scratch, "lock"),
    ...extra,
  };
  if (!("SSH_ORIGINAL_COMMAND" in extra)) delete e.SSH_ORIGINAL_COMMAND;
  return e;
}

/** The wrapper as the forced command: the client's command is SSH_ORIGINAL_COMMAND. */
function forced(command, extra = {}) {
  const e = env(
    command === undefined ? extra : { SSH_ORIGINAL_COMMAND: command, ...extra }
  );
  return spawnSync("bash", [WRAPPER], { env: e, encoding: "utf8" });
}

function deployCalls() {
  return existsSync(calls) ? readFileSync(calls, "utf8") : null;
}

beforeEach(() => rmSync(calls, { force: true }));

describe("deploy-key-wrapper.sh", () => {
  test("a full SHA runs igs-deploy.sh with exactly that one argument", () => {
    const r = forced(SHA);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(deployCalls(), `1\n${SHA}\n`);
  });

  test("the SHA can also be the one argument (run by hand)", () => {
    const r = spawnSync("bash", [WRAPPER, SHA], {
      env: env(),
      encoding: "utf8",
    });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(deployCalls(), `1\n${SHA}\n`);
  });

  test("igs-deploy.sh failing fails the wrapper with its status", () => {
    const r = forced(SHA, { STUB_EXIT: "3" });
    assert.equal(r.status, 3);
  });

  const refused = {
    "nothing (an interactive login)": undefined,
    empty: "",
    "a short SHA": SHA.slice(0, 12),
    "41 characters": `${SHA}0`,
    "upper case": SHA.toUpperCase(),
    "not hex": `${SHA.slice(0, 39)}g`,
    "a command after `;`": `${SHA};id`,
    "a command after `&&`": `${SHA} && id`,
    "a space and a second word": `${SHA} ${SHA}`,
    "a leading space": ` ${SHA}`,
    "a trailing newline": `${SHA}\n`,
    "a newline then a command": `${SHA}\nid`,
    "a command substitution": `$(id)`,
    "a shell": "bash",
    "an option": "--help",
  };
  for (const [name, command] of Object.entries(refused)) {
    test(`refuses ${name}, and nothing runs`, () => {
      const r = forced(command);
      assert.equal(r.status, 2, `status ${r.status}: ${r.stderr}`);
      assert.match(r.stderr, /refused/);
      assert.equal(deployCalls(), null);
    });
  }

  test("refuses two arguments", () => {
    const r = spawnSync("bash", [WRAPPER, SHA, SHA], {
      env: env(),
      encoding: "utf8",
    });
    assert.equal(r.status, 2);
    assert.equal(deployCalls(), null);
  });

  test("one deploy at a time: a second one is refused while the first runs", async () => {
    const first = spawn("bash", [WRAPPER], {
      env: env({ SSH_ORIGINAL_COMMAND: SHA, STUB_SLEEP: "2" }),
    });
    const done = new Promise((resolve) => first.on("exit", resolve));
    // Wait until the first one holds the lock (its stub has been called).
    for (let i = 0; i < 50 && deployCalls() === null; i++)
      await new Promise((r) => setTimeout(r, 100));
    const second = forced(SHA);
    assert.equal(second.status, 75, second.stderr);
    assert.match(second.stderr, /another igs deploy is running/);
    assert.equal(await done, 0);
    assert.equal(deployCalls(), `1\n${SHA}\n`);
  });
});

describe("igs-deploy.yml", () => {
  const wf = readFileSync(WORKFLOW, "utf8");

  test("runs on a manual dispatch and on the igs-deploy repository_dispatch", () => {
    assert.match(wf, /^ {2}workflow_dispatch:\n/m);
    assert.match(wf, /^ {2}repository_dispatch:\n {4}types: \[igs-deploy\]$/m);
  });

  test("uses the igs-staging environment and one deploy at a time", () => {
    assert.match(wf, /^ {4}environment: igs-staging$/m);
    assert.match(
      wf,
      /^ {2}group: igs-deploy-staging\n {2}cancel-in-progress: false$/m
    );
  });

  test("never interpolates the SHA or a secret into a shell script", () => {
    for (const line of wf.split("\n")) {
      if (/\$\{\{\s*(inputs|github\.event|secrets)\./.test(line)) {
        assert.match(
          line,
          /^\s+[A-Z_]+: \$\{\{/,
          `only in env: ${line.trim()}`
        );
      }
    }
  });

  test("checks the host key strictly and never opens a shell", () => {
    assert.match(wf, /StrictHostKeyChecking=yes/);
    assert.match(wf, /BatchMode=yes/);
    assert.match(wf, /-T\b/);
  });
});

import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { RIGHT, WRONG, findWrongSpelling } from "./check-brand-spelling.mjs";

function repoWith(files) {
  const dir = mkdtempSync(path.join(tmpdir(), "brand-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  for (const [name, content] of Object.entries(files)) writeFileSync(path.join(dir, name), content);
  execFileSync("git", ["add", "-A"], { cwd: dir });
  return dir;
}

test("the right spelling and technical ids pass", () => {
  const dir = repoWith({
    "a.md": `${RIGHT} Digital, ${RIGHT} OS\n`,
    "b.ts": 'import x from "@asafarim/ui"; const host = "asafarim.site"; process.env.ASAFARIM_HUB_URL;\n',
  });
  try {
    assert.deepEqual(findWrongSpelling(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("every occurrence of the wrong spelling is reported with file and line", () => {
  const dir = repoWith({ "page.html": `<title>${WRONG} OS</title>\nok\n${WRONG} Digital\n` });
  try {
    assert.deepEqual(findWrongSpelling(dir), [`page.html:1:<title>${WRONG} OS</title>`, `page.html:3:${WRONG} Digital`]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("this repository is clean", () => {
  assert.deepEqual(findWrongSpelling(), []);
});

test("the CLI exits 1 and lists the hit when a tracked file has the wrong spelling, 0 when clean", () => {
  const cli = fileURLToPath(new URL("./check-brand-spelling.mjs", import.meta.url));
  const bad = repoWith({ "page.html": `${WRONG}\n` });
  const good = repoWith({ "page.html": `${RIGHT}\n` });
  try {
    const failing = spawnSync(process.execPath, [cli], { cwd: bad, encoding: "utf8" });
    assert.equal(failing.status, 1);
    assert.match(failing.stderr, /page\.html:1:/);
    const passing = spawnSync(process.execPath, [cli], { cwd: good, encoding: "utf8" });
    assert.equal(passing.status, 0);
  } finally {
    rmSync(bad, { recursive: true, force: true });
    rmSync(good, { recursive: true, force: true });
  }
});

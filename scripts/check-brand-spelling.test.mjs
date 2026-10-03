import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
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

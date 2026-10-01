import { fileURLToPath } from "node:url";
import path from "node:path";
import type { TestCaseDefinition, TestFixtureDefinition } from "@/test-engine/types";
import { generateFixtureScript } from "./fixtureGenerator";

// Generated specs run as standalone files via TestCafe's own compiler, which
// has no knowledge of the "@/*" tsconfig path alias, so the scenario runner
// must be imported by absolute filesystem path instead.
const scenarioRunnerPath = path
  .resolve(path.dirname(fileURLToPath(import.meta.url)), "../executors/scenarioRunner.js")
  .replace(/\\/g, "/");

function mergeInput(
  commonInput: Record<string, unknown>,
  override: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return { ...commonInput, ...(override ?? {}) };
}

/**
 * Build a readable test name that includes the run index and, when a `url`
 * is present, the source hostname so failures are easy to map back to a
 * specific listing/site.
 */
function formatRunLabel(title: string, run: Record<string, unknown>, index: number): string {
  const url = run.url;
  if (typeof url === "string" && url.length > 0) {
    try {
      return `${title} (run ${index + 1} — ${new URL(url).hostname})`;
    } catch {
      return `${title} (run ${index + 1} — ${url.slice(0, 60)})`;
    }
  }
  return `${title} (run ${index + 1})`;
}

/**
 * Helper injected into every generated spec: on the way out of a test (pass or
 * fail) it writes the page's outer HTML to a sidecar file under
 * `TESTORA_DOM_DIR`, keyed by a sanitised test name. The executor keeps the
 * snapshot only for tests that actually failed and discards the rest
 * (issue #259). Best-effort — a navigation-away or a closed page is swallowed.
 */
function domCaptureHelper(): string {
  return [
    `const { writeFileSync: __writeFileSync, mkdirSync: __mkdirSync } = require("node:fs");`,
    `const { join: __joinPath } = require("node:path");`,
    `async function __captureDom(t, label) {`,
    `  const dir = process.env.TESTORA_DOM_DIR;`,
    `  if (!dir) return;`,
    `  try {`,
    `    const html = await t.eval(() => document.documentElement.outerHTML);`,
    `    if (typeof html !== "string" || html.length === 0) return;`,
    `    __mkdirSync(dir, { recursive: true });`,
    `    const safe = String(label).replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 180);`,
    `    __writeFileSync(__joinPath(dir, safe + ".html"), html.slice(0, 3000000));`,
    `  } catch (e) { /* page gone — nothing to snapshot */ }`,
    `}`,
  ].join("\n");
}

/** Sidecar filename the DOM snapshot is written to for a given test name. */
export function domSnapshotFileName(testName: string): string {
  return `${testName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(0, 180)}.html`;
}

/** Wrap a test body so `__captureDom` always runs after it. */
function withDomCapture(nameExpr: string, bodyLines: string[]): string[] {
  return [
    `  try {`,
    ...bodyLines.map((line) => (line.length > 0 ? `  ${line}` : line)),
    `  } finally {`,
    `    await __captureDom(t, ${nameExpr});`,
    `  }`,
  ];
}

/**
 * Emits a TestCafe spec for one fixture and its test cases. Each generated
 * test delegates to runScenario(t, data, expected, env) from the scenario runner,
 * which is the pluggable boundary between generic platform code and a
 * specific app's selectors/assertions.
 */
/**
 * Per-run environment for one spec. Up to TESTORA_MAX_CONCURRENT_RUNS runs
 * share this Node process, so per-run values can't live in the global
 * `process.env` (two runs would overwrite each other). Instead each spec
 * shadows `process` with a view whose `env` is ONLY this run's values — the
 * target's secrets and the run's own TESTORA_* / WEBAPP_API_URL (#702) — never
 * the server's environment. Everything else is the real process object.
 *
 * Always emitted, even for an empty env, so a spec can never fall through to
 * the server's process.env. (Spec code is admin-authored and runs in-process,
 * so this is a scoping guarantee for test data and well-behaved scripts, not a
 * sandbox — see #706 for isolating the runner.)
 */
export function specEnvPrelude(env: Record<string, string | undefined>): string {
  const overrides = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  return [
    `const __testoraRunEnv = Object.freeze(${JSON.stringify(overrides)});`,
    `const process = new Proxy(globalThis.process, {`,
    `  get(target, key) {`,
    `    if (key === "env") return __testoraRunEnv;`,
    `    const value = Reflect.get(target, key);`,
    `    return typeof value === "function" ? value.bind(target) : value;`,
    `  },`,
    `});`,
  ].join("\n");
}

export function generateTestSpec(
  fixture: TestFixtureDefinition,
  cases: TestCaseDefinition[],
  runEnv: Record<string, string | undefined> = {},
): string {
  const header = [
    `import { Selector } from "testcafe";`,
    `import { runScenario } from ${JSON.stringify(scenarioRunnerPath)};`,
    ``,
    specEnvPrelude(runEnv),
    ``,
    domCaptureHelper(),
    ``,
    generateFixtureScript(fixture),
    ``,
  ].join("\n");

  const body = cases
    .map((testCase) => generateCaseBlock(fixture, testCase))
    .join("\n\n");

  return `${header}\n${body}\n`;
}

function generateCaseBlock(fixture: TestFixtureDefinition, testCase: TestCaseDefinition): string {
  if (testCase.scriptType === "scripted") {
    if (testCase.runs && testCase.runs.length > 0) {
      // Scripted + runs: loop over runs, exposing each as `run` in scope so
      // the script body can parameterize itself (e.g. run.url) instead of
      // hardcoding a single value.
      const runs = testCase.runs.map((run) => mergeInput(fixture.commonInput, run));
      const labels = runs.map((run, i) => formatRunLabel(testCase.title, run, i));
      const nameExpr = `labels_${safeIdent(testCase.caseId)}[i]`;
      return [
        `const runs_${safeIdent(testCase.caseId)} = ${JSON.stringify(runs)};`,
        `const labels_${safeIdent(testCase.caseId)} = ${JSON.stringify(labels)};`,
        `for (const [i, run] of runs_${safeIdent(testCase.caseId)}.entries()) {`,
        `  test(${nameExpr}, async t => {`,
        ...withDomCapture(nameExpr, [indent(testCase.script ?? "", "  ")]),
        `  });`,
        `}`,
      ].join("\n");
    }
    const nameExpr = JSON.stringify(testCase.title);
    return [
      `test(${nameExpr}, async t => {`,
      ...withDomCapture(nameExpr, [testCase.script ?? ""]),
      `});`,
    ].join("\n");
  }

  if (testCase.scriptType === "single") {
    const data = mergeInput(fixture.commonInput, testCase.input);
    const nameExpr = JSON.stringify(testCase.title);
    return [
      `test(${nameExpr}, async t => {`,
      ...withDomCapture(nameExpr, [
        `  await runScenario(t, ${JSON.stringify(data)}, ${JSON.stringify(testCase.expected)}, process.env);`,
      ]),
      `});`,
    ].join("\n");
  }

  const runs = (testCase.runs ?? []).map((run) => mergeInput(fixture.commonInput, run));
  const labels = runs.map((run, i) => formatRunLabel(testCase.title, run, i));
  const nameExpr = `labels_${safeIdent(testCase.caseId)}[i]`;
  return [
    `const runs_${safeIdent(testCase.caseId)} = ${JSON.stringify(runs)};`,
    `const labels_${safeIdent(testCase.caseId)} = ${JSON.stringify(labels)};`,
    `for (const [i, run] of runs_${safeIdent(testCase.caseId)}.entries()) {`,
    `  test(${nameExpr}, async t => {`,
    ...withDomCapture(nameExpr, [
      `  await runScenario(t, run, ${JSON.stringify(testCase.expected)}, process.env);`,
    ]),
    `  });`,
    `}`,
  ].join("\n");
}

function safeIdent(id: string): string {
  return id.replace(/[^a-zA-Z0-9_]/g, "_");
}

function indent(code: string, prefix: string): string {
  return code
    .split("\n")
    .map((line) => (line.length > 0 ? `${prefix}${line}` : line))
    .join("\n");
}

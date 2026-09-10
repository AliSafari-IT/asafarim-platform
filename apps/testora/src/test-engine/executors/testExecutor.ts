import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import createTestCafe from "testcafe";
import { db } from "@/db/client";
import {
  functionalRequirements,
  testCases,
  testFixtures,
  testResults,
  testSuites,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateTestSpec } from "@/test-engine/generators/testGenerator";
import { resolveFixtureBaseUrl } from "@/test-engine/resolveFixtureBaseUrl";
import { captureFailureArtifacts } from "@/test-engine/artifacts";
import { buildStepTimeline, type StepErrorMeta } from "@/test-engine/artifact-timeline";
import { domSnapshotFileName } from "@/test-engine/generators/testGenerator";
import type {
  TestCaseDefinition,
  TestFixtureDefinition,
  TestRunResult,
} from "@/test-engine/types";

export interface ExecuteFixtureOptions {
  browser?: string;
  headless?: boolean;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;

// Chrome flags that make headless launches reliable when TestCafe runs *inside*
// the Next.js dev server process (shared event loop, sandboxing, no /dev/shm on
// some hosts). Harmless on a normal desktop, and they prevent the most common
// "Cannot establish browser connection" launch failures.
const HEADLESS_CHROME =
  "chrome:headless --no-sandbox --disable-gpu --disable-dev-shm-usage";

/**
 * The browser string TestCafe should drive. Defaults to a hardened headless
 * Chrome, but is fully overridable for debugging:
 *   E2E_BROWSER="chrome:headless --some-flag"  → use this verbatim
 *   E2E_HEADFUL=1                              → run a visible Chrome window
 */
function resolveBrowser(options: ExecuteFixtureOptions): string {
  if (options.browser) return options.browser;
  if (process.env.E2E_BROWSER) return process.env.E2E_BROWSER;
  if (options.headless === false || process.env.E2E_HEADFUL === "1")
    return "chrome";
  return HEADLESS_CHROME;
}

// How long TestCafe waits for the browser to connect back. The default (2 min)
// is too low when the dev server's event loop is busy compiling routes while
// Chrome is starting; allow a generous default and an env override.
const BROWSER_INIT_TIMEOUT =
  Number(process.env.E2E_BROWSER_INIT_TIMEOUT) || 300_000;

export async function executeFixture(
  fixture: TestFixtureDefinition,
  cases: TestCaseDefinition[],
  options: ExecuteFixtureOptions = {},
): Promise<TestRunResult[]> {
  const spec = generateTestSpec(fixture, cases);
  const dir = await mkdtemp(path.join(tmpdir(), "e2e-testora-"));
  const specPath = path.join(dir, `${fixture.fixtureId}.spec.js`);
  // TestCafe writes failure screenshots here; we read + inline them, then the
  // whole temp dir (specs + screenshots) is removed in `finally`.
  const screenshotsDir = path.join(dir, "screenshots");
  // Sidecar dirs for the richer failure artifacts added in #259: DOM snapshots
  // written by the injected __captureDom helper, and TestCafe videos when the
  // fixture opts in with metadata.recordVideo.
  const domDir = path.join(dir, "dom");
  const videoDir = path.join(dir, "video");
  await writeFile(specPath, spec, "utf8");

  const testcafe = await createTestCafe();
  const results: TestRunResult[] = [];

  // The origin this run executed against (already retargeted to the chosen base
  // scope by the run route). Stored on each result so the catalog lists can show
  // a domain badge next to the last pass/fail.
  const targetBaseUrl = (() => {
    try {
      return fixture.baseUrl ? new URL(fixture.baseUrl).origin : null;
    } catch {
      return null;
    }
  })();
  const resultDetails: Record<string, unknown> = targetBaseUrl
    ? { targetBaseUrl }
    : {};

  const logStream = new Writable({
    write(chunk, _encoding, callback) {
      if (options.onLog) {
        const text = chunk.toString("utf8").replace(ANSI_PATTERN, "");
        for (const line of text.split("\n")) {
          if (line.trim().length > 0) options.onLog(line);
        }
      }
      callback();
    },
  });

  let abortHandler: (() => void) | undefined;
  try {
    const runner = testcafe.createRunner();
    abortHandler = () => {
      Promise.resolve(runner.stop()).catch(() => {
        /* suppress WebSocket close noise on cancel */
      });
    };
    options.signal?.addEventListener("abort", abortHandler);
    const browser = resolveBrowser(options);
    const startedAt = Date.now();
    // Capture per-test outcomes (name, duration, formatted errors) alongside the
    // human-readable spec stream, so stored results carry the *same* error text
    // shown in the live console — not just a fixture-level pass/fail.
    const captured: CapturedTest[] = [];
    // TestCafe accepts a reporter-plugin *factory* as a reporter `name` at
    // runtime, but its typings only permit built-in string names — hence the
    // cast. The "spec" reporter still streams to the live console.
    const reporters = [
      { name: "spec", output: logStream },
      { name: createCaptureReporter(captured) },
    ] as unknown as string;
    // The injected __captureDom helper writes page HTML here on the way out of
    // each test; cleared in `finally` so it never leaks to an unrelated run.
    const recordVideo = fixture.metadata?.recordVideo === true;
    process.env.TESTORA_DOM_DIR = domDir;

    let failedCount: number;
    try {
      let pending = runner
        .src(specPath)
        .browsers(browser)
        // Auto-capture a screenshot the moment a test fails, so reports can show
        // exactly what the page looked like at the point of failure.
        .screenshots({ path: screenshotsDir, takeOnFails: true });
      if (recordVideo) {
        // Only keep video for tests that fail — a green run needs none.
        pending = pending.video(videoDir, { failedOnly: true, singleFile: false });
      }
      failedCount = await pending
        .reporter(reporters)
        .run({
          // Local dev environments (Next.js JIT-compiling routes on first
          // request) can be much slower than production — give navigation
          // and in-page AJAX calls a generous ceiling on top of any explicit
          // per-selector timeouts in the test scripts themselves.
          pageLoadTimeout: 60000,
          ajaxRequestTimeout: 60000,
          // Tolerate a slow browser handshake when the dev server's event loop
          // is busy. The default 2 min is what surfaces as "Cannot establish
          // browser connection".
          browserInitTimeout: BROWSER_INIT_TIMEOUT,
          // Fixtures flagged `flaky` (e.g. tests against external production
          // apps prone to transient DNS/network/AI-rate-limit hiccups) re-run a
          // failed test up to 3× and pass if it succeeds once. Stable fixtures
          // are unaffected (a passing test still runs once).
          ...(fixture.metadata?.flaky
            ? { quarantineMode: { attemptLimit: 3, successThreshold: 1 } }
            : {}),
        });
    } catch (runErr) {
      // When the run is cancelled via runner.stop(), TestCafe / chrome-remote-interface
      // throws a "WebSocket connection closed" error. Swallow it silently if the
      // signal was aborted; otherwise re-throw so the caller sees a real failure.
      if (options.signal?.aborted) return results;
      throw runErr;
    }

    if (captured.length > 0) {
      // One result row per executed test (per run), mapped back to its case.
      const titleToCaseId = new Map(
        cases.map((testCase) => [testCase.title, testCase.caseId]),
      );
      for (const test of captured) {
        const { title, runIndex } = parseTestName(test.name);
        const caseId = titleToCaseId.get(title);
        // A title that doesn't map to a known case id can't be persisted (it would
        // violate the test_results FK). Skip it with a warning rather than letting
        // one stray row abort the whole fixture's insert and lose every result.
        if (caseId == null) {
          options.onLog?.(
            `⚠ Could not map test "${test.name}" to a known case; result not stored.`,
          );
          continue;
        }
        const errorMessage =
          test.errs.length > 0 ? test.errs.join("\n\n").slice(0, 8000) : null;

        // Per-test details: shared run info (target) plus, for a failure, the
        // structured step timeline and object-storage refs to the captured
        // screenshot / DOM snapshot / video. Binaries are uploaded now, after
        // the run finished but before the temp dir is removed; only small refs
        // land on the row (issue #259).
        const resultId = randomUUID();
        const details: Record<string, unknown> = { ...resultDetails };

        if (test.failed) {
          const steps = buildStepTimeline(test.errMeta);
          if (steps.length > 0) details.steps = steps;

          const artifactRefs = await captureFailureArtifacts({
            resultId,
            screenshotPath: test.screenshotPath,
            domSnapshotPath: path.join(domDir, domSnapshotFileName(test.name)),
            videoPath: test.videoPath,
            log: options.onLog,
          });
          if (Object.keys(artifactRefs).length > 0) {
            details.artifactRefs = artifactRefs;
          } else {
            options.onLog?.(
              `⚠ No failure artifacts captured for "${test.name}".`,
            );
          }
        }

        results.push(
          buildResult(
            resultId,
            caseId,
            test.failed ? "failed" : "passed",
            runIndex,
            test.durationMs,
            details,
            errorMessage,
          ),
        );
      }
    } else {
      // Nothing captured (e.g. a compile/startup error before any test ran) —
      // still record the fixture-level outcome so the run is visible.
      const status = failedCount === 0 ? "passed" : "failed";
      const elapsed = Date.now() - startedAt;
      for (const testCase of cases) {
        results.push(
          buildResult(
            randomUUID(),
            testCase.caseId,
            status,
            null,
            elapsed,
            resultDetails,
            null,
          ),
        );
      }
    }
  } finally {
    if (abortHandler)
      options.signal?.removeEventListener("abort", abortHandler);
    delete process.env.TESTORA_DOM_DIR;
    await testcafe.close();
    await rm(dir, { recursive: true, force: true });
  }

  await persistResults(results);
  return results;
}

function buildResult(
  id: string,
  caseId: string,
  status: TestRunResult["status"],
  runIndex: number | null,
  durationMs: number,
  details: Record<string, unknown>,
  errorMessage: string | null,
): TestRunResult {
  return {
    id,
    caseId,
    status,
    runIndex,
    durationMs,
    details,
    errorMessage,
    createdAt: new Date().toISOString(),
  };
}

interface CapturedTest {
  name: string;
  errs: string[];
  durationMs: number;
  failed: boolean;
  // Path to the screenshot TestCafe took on failure, if any. The file is read
  // and uploaded *after* the run finishes so the temp directory is guaranteed
  // to still exist, avoiding a race with the reporter callback.
  screenshotPath?: string;
  // Path to the TestCafe video for this test, when the fixture opts into
  // recording and the test failed.
  videoPath?: string;
  // Raw `apiFnChain` / `apiFnIndex` off the first TestCafe error, used to
  // reconstruct the step timeline without holding a reference to the whole
  // (potentially circular) error adapter.
  errMeta?: StepErrorMeta;
}

// Minimal view of the TestCafe ReporterPluginHost that our methods run on.
interface ReporterHost {
  formatError(err: unknown, prefix?: string): string;
}

/**
 * A custom TestCafe reporter that records each test's name, duration and
 * formatted errors into `collector`. TestCafe merges these methods onto a host
 * that provides `formatError()` (the very formatter the built-in reporters use
 * for their error blocks), so the captured text matches the live console.
 */
function createCaptureReporter(collector: CapturedTest[]) {
  return function reporterPluginFactory() {
    return {
      reportTaskStart() {},
      reportFixtureStart() {},
      reportTestDone(
        name: string,
        testRunInfo: {
          errs?: unknown[];
          durationMs?: number;
          screenshots?: Array<{ screenshotPath?: string; takenOnFail?: boolean }>;
          videos?: Array<{ videoPath?: string }>;
        },
      ) {
        const host = this as unknown as ReporterHost;
        const rawErrs = Array.isArray(testRunInfo.errs) ? testRunInfo.errs : [];
        const errs = rawErrs.map((err) =>
          host.formatError(err).replace(ANSI_PATTERN, "").trimEnd(),
        );
        const failed = rawErrs.length > 0;
        // Prefer the shot TestCafe took on failure; fall back to any screenshot.
        const shots = Array.isArray(testRunInfo.screenshots)
          ? testRunInfo.screenshots
          : [];
        const screenshotPath =
          shots.find((s) => s.takenOnFail)?.screenshotPath ??
          shots[0]?.screenshotPath;
        const videos = Array.isArray(testRunInfo.videos) ? testRunInfo.videos : [];
        const videoPath = videos.find((v) => v?.videoPath)?.videoPath;
        const firstErr = rawErrs[0] as
          | { apiFnChain?: unknown; apiFnIndex?: unknown }
          | undefined;
        const errMeta: StepErrorMeta | undefined = firstErr
          ? { apiFnChain: firstErr.apiFnChain, apiFnIndex: firstErr.apiFnIndex }
          : undefined;
        collector.push({
          name,
          errs,
          durationMs: testRunInfo.durationMs ?? 0,
          failed,
          screenshotPath,
          videoPath,
          errMeta,
        });
      },
      reportTaskDone() {},
    };
  };
}

// Reverses formatRunLabel():
//   "Some title (run 2)"                 → { title: "Some title", runIndex: 1 }
//   "Some title (run 2 — www.immoweb.be)" → { title: "Some title", runIndex: 1 }
// The optional "— <label>" suffix (a per-run url's hostname) must be stripped so
// the title still resolves back to its case id — otherwise the run label leaks
// into the persisted case_id and violates the test_results FK constraint.
function parseTestName(name: string): {
  title: string;
  runIndex: number | null;
} {
  const match = /^(.*?)\s+\(run (\d+)(?:\s+—\s+[^)]*)?\)$/.exec(name);
  if (match) return { title: match[1] ?? name, runIndex: Number(match[2]) - 1 };
  return { title: name, runIndex: null };
}

async function persistResults(results: TestRunResult[]): Promise<void> {
  if (results.length === 0) return;
  await db.insert(testResults).values(
    results.map((result) => ({
      id: result.id,
      caseId: result.caseId,
      status: result.status,
      runIndex: result.runIndex,
      durationMs: result.durationMs,
      details: result.details,
      errorMessage: result.errorMessage,
    })),
  );
}

export async function loadFixtureWithCases(fixtureId: string): Promise<{
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
} | null> {
  const fixtureRow = await db.query.testFixtures.findFirst({
    where: eq(testFixtures.fixtureId, fixtureId),
    with: { suite: { with: { functionalRequirement: true } } },
  });
  if (!fixtureRow) return null;

  const caseRows = await db.query.testCases.findMany({
    where: eq(testCases.fixtureId, fixtureId),
  });

  const fixture = mapFixtureRow(
    fixtureRow,
    fixtureRow.suite?.functionalRequirement?.baseUrl,
  );
  const cases = caseRows.map(mapCaseRow);

  return { fixture, cases };
}

// A single fixture-worth of work, annotated with its suite title so the
// aggregated report can attribute each case to the right suite.
export interface RunUnit {
  suiteTitle: string;
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
}

export interface RunPlan {
  label: string;
  units: RunUnit[];
}

type FixtureRow = typeof testFixtures.$inferSelect;
type CaseRow = typeof testCases.$inferSelect;

function mapFixtureRow(
  row: FixtureRow,
  frBaseUrl: string | null | undefined,
): TestFixtureDefinition {
  return {
    fixtureId: row.fixtureId,
    suiteId: row.suiteId,
    title: row.title,
    baseUrl: resolveFixtureBaseUrl(frBaseUrl, row.baseUrl),
    commonInput: row.commonInput ?? {},
    setupScript: row.setupScript ?? undefined,
    teardownScript: row.teardownScript ?? undefined,
    metadata: row.metadata ?? undefined,
  };
}

function mapCaseRow(row: CaseRow): TestCaseDefinition {
  return {
    caseId: row.caseId,
    fixtureId: row.fixtureId,
    title: row.title,
    scriptType: row.scriptType,
    input: row.input ?? undefined,
    runs: row.runs ?? undefined,
    expected: row.expected ?? {},
    script: row.script ?? undefined,
  };
}

/** Build a one-fixture run plan. */
export async function loadFixtureRunPlan(
  fixtureId: string,
): Promise<RunPlan | null> {
  const fixtureRow = await db.query.testFixtures.findFirst({
    where: eq(testFixtures.fixtureId, fixtureId),
    with: { suite: { with: { functionalRequirement: true } }, cases: true },
  });
  if (!fixtureRow) return null;

  return {
    label: `fixture "${fixtureRow.title}"`,
    units: [
      {
        suiteTitle: fixtureRow.suite?.title ?? fixtureRow.suiteId,
        fixture: mapFixtureRow(
          fixtureRow,
          fixtureRow.suite?.functionalRequirement?.baseUrl,
        ),
        cases: fixtureRow.cases.map(mapCaseRow),
      },
    ],
  };
}

/** Build a run plan covering every fixture in a suite. */
export async function loadSuiteRunPlan(
  suiteId: string,
): Promise<RunPlan | null> {
  const suiteRow = await db.query.testSuites.findFirst({
    where: eq(testSuites.suiteId, suiteId),
    with: { functionalRequirement: true, fixtures: { with: { cases: true } } },
  });
  if (!suiteRow) return null;

  const frBaseUrl = suiteRow.functionalRequirement?.baseUrl;
  return {
    label: `suite "${suiteRow.title}"`,
    units: suiteRow.fixtures.map((fixtureRow) => ({
      suiteTitle: suiteRow.title,
      fixture: mapFixtureRow(fixtureRow, frBaseUrl),
      cases: fixtureRow.cases.map(mapCaseRow),
    })),
  };
}

/**
 * Build a run plan from an explicit set of (fixture, case) selections — the
 * basis for "rerun failed". The selections may span any number of fixtures and
 * suites (whatever scope the original run covered); they are grouped per
 * fixture, deduped, and any ids no longer present are silently skipped.
 */
export async function loadSelectionRunPlan(
  selections: { fixtureId: string; caseId: string }[],
): Promise<RunPlan | null> {
  const caseIdsByFixture = new Map<string, Set<string>>();
  for (const { fixtureId, caseId } of selections) {
    const set = caseIdsByFixture.get(fixtureId) ?? new Set<string>();
    set.add(caseId);
    caseIdsByFixture.set(fixtureId, set);
  }

  const units: RunUnit[] = [];
  for (const [fixtureId, caseIds] of caseIdsByFixture) {
    const fixtureRow = await db.query.testFixtures.findFirst({
      where: eq(testFixtures.fixtureId, fixtureId),
      with: { suite: { with: { functionalRequirement: true } }, cases: true },
    });
    if (!fixtureRow) continue;

    const cases = fixtureRow.cases
      .filter((row) => caseIds.has(row.caseId))
      .map(mapCaseRow);
    if (cases.length === 0) continue;

    units.push({
      suiteTitle: fixtureRow.suite?.title ?? fixtureRow.suiteId,
      fixture: mapFixtureRow(
        fixtureRow,
        fixtureRow.suite?.functionalRequirement?.baseUrl,
      ),
      cases,
    });
  }

  if (units.length === 0) return null;
  const total = units.reduce((sum, unit) => sum + unit.cases.length, 0);
  return { label: `${total} selected case(s)`, units };
}

/** Build a run plan covering every fixture across every suite of a requirement. */
export async function loadRequirementRunPlan(
  frId: string,
): Promise<RunPlan | null> {
  const frRow = await db.query.functionalRequirements.findFirst({
    where: eq(functionalRequirements.id, frId),
    with: { suites: { with: { fixtures: { with: { cases: true } } } } },
  });
  if (!frRow) return null;

  const units: RunUnit[] = [];
  for (const suiteRow of frRow.suites) {
    for (const fixtureRow of suiteRow.fixtures) {
      units.push({
        suiteTitle: suiteRow.title,
        fixture: mapFixtureRow(fixtureRow, frRow.baseUrl),
        cases: fixtureRow.cases.map(mapCaseRow),
      });
    }
  }

  return { label: `requirement "${frRow.title}"`, units };
}

/** Build a run plan covering every fixture of every functional requirement. */
export async function loadAllRunPlan(
  projectId?: string,
): Promise<RunPlan | null> {
  const frRows = await db.query.functionalRequirements.findMany({
    where: projectId
      ? eq(functionalRequirements.projectId, projectId)
      : undefined,
    with: { suites: { with: { fixtures: { with: { cases: true } } } } },
  });

  const units: RunUnit[] = [];
  for (const frRow of frRows) {
    for (const suiteRow of frRow.suites) {
      for (const fixtureRow of suiteRow.fixtures) {
        units.push({
          suiteTitle: suiteRow.title,
          fixture: mapFixtureRow(fixtureRow, frRow.baseUrl),
          cases: fixtureRow.cases.map(mapCaseRow),
        });
      }
    }
  }

  if (units.length === 0) return null;
  const scope = projectId ? `${projectId} ` : "";
  return { label: `all ${scope}requirements (${frRows.length})`, units };
}

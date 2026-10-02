import path from "node:path";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import createTestCafe from "testcafe";
import { buildStepTimeline, type StepErrorMeta, type StoredArtifactRefs } from "@/test-engine/artifact-timeline";
import { domSnapshotFileName } from "@/test-engine/generators/testGenerator";
import type {
  TestCaseDefinition,
  TestFixtureDefinition,
  TestRunResult,
} from "@/test-engine/types";

/**
 * Runs one generated TestCafe spec and maps what happened to result rows —
 * with NO database or storage access (ADR 0004 step 2, #717), so the same
 * code serves both the in-process executor (testExecutor.ts) and the
 * isolated runner's child process (src/runner/job.ts). Where failure artifacts
 * go is the caller's choice (`uploadArtifacts`): object storage in-process,
 * the runner's PUT /internal/runner/…/artifacts in remote mode.
 */

export interface UploadArtifactsInput {
  resultId: string;
  screenshotPath?: string;
  domSnapshotPath?: string;
  videoPath?: string;
  log?: (line: string) => void;
}

export interface RunSpecInput {
  /** The spec file (already written) and its sidecar dirs. */
  specPath: string;
  screenshotsDir: string;
  domDir: string;
  videoDir: string;
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
  browser?: string;
  headless?: boolean;
  onLog?: (line: string) => void;
  signal?: AbortSignal;
  uploadArtifacts: (input: UploadArtifactsInput) => Promise<StoredArtifactRefs>;
  /** The runner's child records paths and uploads later — don't warn about empty refs. */
  artifactsDeferred?: boolean;
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
function resolveBrowser(options: { browser?: string; headless?: boolean }): string {
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

// After a cancel/timeout, how long runner.stop() gets before TestCafe is
// force-closed (killing its browsers).
const ABORT_CLOSE_GRACE_MS = 10_000;

// testcafe.close() awaits runner.stop() and the browser-connection gateway's
// own close — both of which assume every launched browser finished its CDP
// handshake and is a tracked connection. A browser that never connects (a
// stuck host, a cross-origin redirect the proxy can't inject into, resource
// starvation) isn't tracked, so close() can hang indefinitely waiting on a
// handshake that will never complete, holding this promise (and the `finally`
// block awaiting it) open forever with the underlying Chrome process still
// running (issue #619). Bound the wait so a stuck close() can never block
// cleanup — the process itself may still leak, but the run always finishes.
const TESTCAFE_CLOSE_TIMEOUT_MS = 20_000;


export async function runSpec(input: RunSpecInput): Promise<TestRunResult[]> {
  const { specPath, screenshotsDir, domDir, videoDir, fixture, cases } = input;
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
      if (input.onLog) {
        const text = chunk.toString("utf8").replace(ANSI_PATTERN, "");
        for (const line of text.split("\n")) {
          if (line.trim().length > 0) input.onLog(line);
        }
      }
      callback();
    },
  });

  let abortHandler: (() => void) | undefined;
  // testcafe.close() is what actually kills the browsers it launched. It runs
  // in `finally` — but a hung run never gets there, which left orphaned
  // headless Chrome processes eating the host after every stuck/cancelled run.
  // Bounded below (TESTCAFE_CLOSE_TIMEOUT_MS) so a browser that never
  // connected can't hold this — and the run's cleanup — open indefinitely.
  let closed: Promise<void> | null = null;
  const closeTestCafe = () =>
    (closed ??= Promise.race([
      Promise.resolve(testcafe.close()).then(() => true as const),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), TESTCAFE_CLOSE_TIMEOUT_MS).unref?.()),
    ])
      .then((finished) => {
        if (finished) return;
        const message =
          `⚠ testcafe.close() did not finish within ${TESTCAFE_CLOSE_TIMEOUT_MS / 1000}s — ` +
          "a browser that never connected may be left running (see issue #619).";
        input.onLog?.(message);
        console.error(`[testora] ${message}`);
      })
      .catch((error) => {
        const message = `⚠ testcafe.close() failed: ${error instanceof Error ? error.message : String(error)}`;
        input.onLog?.(message);
        console.error(`[testora] ${message}`);
      }));
  try {
    const runner = testcafe.createRunner();
    abortHandler = () => {
      Promise.resolve(runner.stop()).catch(() => {
        /* suppress WebSocket close noise on cancel */
      });
      // If stopping doesn't bring the run back promptly, close TestCafe
      // anyway so its browsers are killed and the host is freed.
      setTimeout(() => void closeTestCafe(), ABORT_CLOSE_GRACE_MS).unref?.();
    };
    input.signal?.addEventListener("abort", abortHandler);
    const browser = resolveBrowser(input);
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
    // The injected __captureDom helper writes page HTML to domDir (handed to
    // the spec through its per-run env) on the way out of each test.
    const recordVideo = fixture.metadata?.recordVideo === true;

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
      if (input.signal?.aborted) return results;
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
          input.onLog?.(
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

          const artifactRefs = await input.uploadArtifacts({
            resultId,
            screenshotPath: test.screenshotPath,
            domSnapshotPath: path.join(domDir, domSnapshotFileName(test.name)),
            videoPath: test.videoPath,
            log: input.onLog,
          });
          if (Object.keys(artifactRefs).length > 0) {
            details.artifactRefs = artifactRefs;
          } else if (!input.artifactsDeferred) {
            input.onLog?.(
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
      input.signal?.removeEventListener("abort", abortHandler);
    await closeTestCafe();
  }


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

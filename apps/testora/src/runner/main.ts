/**
 * Testora's isolated runner (#717, ADR 0004 §2–§3, §6).
 *
 * Pulls jobs from the web app — POST /internal/runner/lease (long-poll) — and
 * runs each in a FRESH child process (src/runner/job.ts) whose env is the job
 * envelope's env plus OS basics, nothing inherited. While a job runs it
 * streams the log back in signed, batched `events` calls (also its heartbeat
 * and cancel channel), then uploads failure artifacts and posts `complete`.
 * Hard stops: the envelope's timeout, a cancel, lease loss. On job end the
 * child's whole process tree (incl. Chromium) is killed and its temp dir
 * removed.
 *
 *   pnpm --filter testora worker:dev     (dev: against http://localhost:3005)
 *
 * Env: TESTORA_RUNNER_URL, TESTORA_RUNNER_TOKEN, TESTORA_RUNNER_SIGNING_SECRETS
 * (signs with the first), TESTORA_RUNNER_CONCURRENCY (default 2), E2E_BROWSER.
 * Jobs only flow when the web app runs with TESTORA_RUNNER_MODE=remote.
 */
import "../test-engine/load-env";
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import path from "node:path";
import { LEASE_DELIVERY_ID, runnerRequestHeaders } from "@/lib/runner-auth";
import { DOM_DIR_PLACEHOLDER, type RunnerEnvelope } from "@/lib/runner-envelope";
import { SCENARIO_RUNNER_PLACEHOLDER } from "@/test-engine/generators/testGenerator";
import {
  ARTIFACT_CONTENT_TYPE,
  ARTIFACT_MAX_BYTES,
  type ArtifactKind,
  type StoredArtifactRef,
} from "@/test-engine/artifact-timeline";
import type { TestRunResult } from "@/test-engine/types";
import type { ChildJob } from "./job";

const APP_DIR = path.resolve(import.meta.dirname, "../..");
const JOB_SCRIPT = path.join(APP_DIR, "src", "runner", "job.ts");
const SCENARIO_RUNNER = path.join(APP_DIR, "src", "test-engine", "executors", "scenarioRunner.js");

const BASE_URL = (process.env.TESTORA_RUNNER_URL || "http://localhost:3005").replace(/\/$/, "");
const TOKEN = process.env.TESTORA_RUNNER_TOKEN?.trim() || "";
const SECRET = (process.env.TESTORA_RUNNER_SIGNING_SECRETS ?? "").split(",")[0]?.trim() || "";
const CONCURRENCY = Math.min(8, Math.max(1, Number(process.env.TESTORA_RUNNER_CONCURRENCY) || 2));
const RUNNER_ID = `${hostname()}:${process.pid}`;
const HEARTBEAT_MS = 2_000;
const IDLE_BACKOFF_MS = 30_000;

/**
 * The only runner-side variables a job's child gets besides the envelope env —
 * what Node and the browser need to start on this OS. Never secrets.
 */
export const OS_ENV_ALLOWLIST = [
  "PATH", "Path", "PATHEXT", "SystemRoot", "SYSTEMROOT", "windir", "ComSpec",
  "TEMP", "TMP", "TMPDIR", "HOME", "USERPROFILE", "LOCALAPPDATA", "APPDATA",
  "ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "CommonProgramFiles",
  "NUMBER_OF_PROCESSORS", "PROCESSOR_ARCHITECTURE", "LANG", "CHROME_BIN",
];

const log = (...args: unknown[]) => console.log(`[runner ${RUNNER_ID}]`, ...args);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** A signed call to the web app (bodies: JSON text, or bytes signed by their sha256). */
async function call(
  method: "POST" | "PUT",
  route: string,
  jobId: string,
  body: string | Buffer,
  opts: { leaseToken?: string; contentType?: string } = {},
): Promise<Response> {
  const signed = typeof body === "string" ? body : createHash("sha256").update(body).digest("hex");
  const headers = runnerRequestHeaders({
    token: TOKEN,
    secret: SECRET,
    jobId,
    rawBody: signed,
    leaseToken: opts.leaseToken,
    runnerId: RUNNER_ID,
  });
  return fetch(`${BASE_URL}${route}`, {
    method,
    headers: { ...headers, "content-type": opts.contentType ?? "application/json" },
    body: typeof body === "string" ? body : new Uint8Array(body),
  });
}

/**
 * Kill every browser a fixture's child launched. Each child gets its own
 * TEMP dir, and TestCafe puts its Chrome profile under TEMP, so the dir shows
 * up in that Chrome's command line. Chrome is NOT reliably in the child's
 * process tree (on Windows its launcher exits and Chrome is reparented), and a
 * surviving headless Chrome breaks the NEXT fixture's browser connection — so
 * this runs after every fixture, not just on cancel.
 */
function killBrowsersUnder(dir: string): Promise<void> {
  return new Promise((resolve) => {
    const proc =
      process.platform === "win32"
        ? spawn(
            "powershell",
            [
              "-NoProfile",
              "-Command",
              `$d = '${dir.replace(/'/g, "''")}'; Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($d) } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
            ],
            { stdio: "ignore", windowsHide: true },
          )
        : spawn("pkill", ["-KILL", "-f", "--", dir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")], { stdio: "ignore" });
    proc.on("close", () => resolve());
    proc.on("error", () => resolve());
  });
}

/** Kill a child and everything it started (Chromium included). */
function killTree(child: ChildProcess, tempDir?: string): void {
  if (child.pid == null) return;
  const pid = child.pid;
  if (tempDir) void killBrowsersUnder(tempDir);
  if (child.exitCode === null && child.signalCode === null) {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    } else {
      try {
        process.kill(-pid, "SIGKILL"); // the child leads its own process group
      } catch {
        child.kill("SIGKILL");
      }
    }
  }
}

function browserString(envelope: RunnerEnvelope): string {
  if (process.env.E2E_BROWSER) return process.env.E2E_BROWSER;
  return `chrome:headless ${envelope.browser.flags.filter((f) => f !== "--headless").join(" ")}`;
}

/** Upload one failed result's artifacts; returns refs for its details. */
async function uploadArtifacts(
  envelope: RunnerEnvelope,
  item: { resultId: string; screenshotPath?: string; domSnapshotPath?: string; videoPath?: string },
  logLine: (line: string) => void,
): Promise<Partial<Record<ArtifactKind, StoredArtifactRef>>> {
  const refs: Partial<Record<ArtifactKind, StoredArtifactRef>> = {};
  const files: [ArtifactKind, string | undefined][] = [
    ["screenshot", item.screenshotPath],
    ["domSnapshot", item.domSnapshotPath],
    ["video", item.videoPath],
  ];
  for (const [kind, file] of files) {
    if (!file) continue;
    let bytes: Buffer;
    try {
      bytes = await readFile(file);
    } catch {
      continue;
    }
    if (kind === "domSnapshot") bytes = bytes.subarray(0, ARTIFACT_MAX_BYTES.domSnapshot);
    if (bytes.byteLength === 0 || bytes.byteLength > Math.min(ARTIFACT_MAX_BYTES[kind], envelope.limits.maxArtifactBytes)) {
      logLine(`⚠ ${kind} artifact is empty or over the size cap; not stored.`);
      continue;
    }
    const res = await call(
      "PUT",
      `/internal/runner/jobs/${envelope.jobId}/artifacts/${kind}/${item.resultId}`,
      envelope.jobId,
      Buffer.from(bytes),
      { leaseToken: envelope.leaseToken, contentType: ARTIFACT_CONTENT_TYPE[kind] },
    ).catch(() => null);
    if (res?.ok) refs[kind] = (await res.json()) as StoredArtifactRef;
    else logLine(`⚠ Failed to store ${kind} artifact (HTTP ${res?.status ?? "error"}).`);
  }
  return refs;
}

async function runJob(envelope: RunnerEnvelope): Promise<void> {
  const { jobId, leaseToken } = envelope;
  log(`job ${jobId}: ${envelope.label} — ${envelope.units.length} fixture(s)`);
  const jobDir = await mkdtemp(path.join(tmpdir(), "testora-job-"));
  const buffered: string[] = [];
  const logLine = (line: string) => buffered.push(line);
  let cancelled = false;
  let timedOut = false;
  let child: ChildProcess | undefined;
  /** The running fixture's own TEMP dir — its browsers are identified by it. */
  let childTemp: string | undefined;

  try {
    // Write each fixture's spec, resolving the envelope's host-specific placeholders.
    const escape = (p: string) => JSON.stringify(p).slice(1, -1);
    const childJob: ChildJob = { units: [], browser: browserString(envelope) };
    for (const [index, unit] of envelope.units.entries()) {
      const unitDir = path.join(jobDir, `u${index}`);
      const domDir = path.join(unitDir, "dom");
      await mkdir(domDir, { recursive: true });
      const specPath = path.join(unitDir, `${unit.fixture.fixtureId.replace(/[^\w.-]/g, "_")}.spec.js`);
      const spec = unit.spec
        .split(DOM_DIR_PLACEHOLDER).join(escape(domDir))
        .split(SCENARIO_RUNNER_PLACEHOLDER).join(escape(SCENARIO_RUNNER));
      await writeFile(specPath, spec, "utf8");
      childJob.units.push({
        fixture: unit.fixture,
        cases: unit.cases,
        specPath,
        screenshotsDir: path.join(unitDir, "screenshots"),
        domDir,
        videoDir: path.join(unitDir, "video"),
      });
    }
    await writeFile(path.join(jobDir, "job.json"), JSON.stringify(childJob), "utf8");

    // The child's env: the envelope's, plus OS basics — nothing else inherited.
    const env: Record<string, string> = { ...envelope.env };
    for (const name of OS_ENV_ALLOWLIST) {
      const value = process.env[name];
      if (value !== undefined && !(name in env)) env[name] = value;
    }
    const units: { fixtureId: string; results: TestRunResult[]; artifacts: { resultId: string }[] }[] = [];
    let crashed = 0;

    /**
     * One fixture in a FRESH child process (several TestCafe instances in one
     * process interfere at teardown); resolves with its exit code.
     */
    const runUnit = async (index: number): Promise<number | null> => {
      // Its own TEMP: TestCafe's Chrome profile lands under it, so every
      // browser this fixture starts can be found and killed (killBrowsersUnder).
      const temp = path.join(jobDir, "tmp", `u${index}`);
      await mkdir(temp, { recursive: true });
      childTemp = temp;
      const proc = spawn(process.execPath, ["--import", "tsx", JOB_SCRIPT, jobDir, String(index)], {
        cwd: APP_DIR,
        env: { ...env, TEMP: temp, TMP: temp, TMPDIR: temp } as unknown as NodeJS.ProcessEnv,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32",
        windowsHide: true,
      });
      child = proc;
      let pending = "";
      let reported = false;
      proc.stdout!.setEncoding("utf8").on("data", (chunk: string) => {
        pending += chunk;
        const lines = pending.split("\n");
        pending = lines.pop() ?? "";
        for (const raw of lines) {
          if (!raw.trim()) continue;
          try {
            const msg = JSON.parse(raw) as { t?: string; line?: string; fixtureId?: string; message?: string };
            if (msg.t === "log" && msg.line) buffered.push(msg.line);
            else if (msg.t === "unit") {
              reported = true;
              units.push(msg as (typeof units)[number]);
            } else if (msg.t === "unit-error") {
              reported = true;
              buffered.push(`✖ Fixture ${msg.fixtureId} could not run: ${msg.message}`);
            } else buffered.push(raw);
          } catch {
            buffered.push(raw); // e.g. OFF_TARGET_REQUEST from the spec
          }
        }
      });
      proc.stderr!.setEncoding("utf8").on("data", (chunk: string) => {
        for (const line of chunk.split("\n")) if (line.trim()) buffered.push(line);
      });
      return new Promise((resolve) =>
        proc.on("close", (code) => {
          // Even a clean exit can leave its Chrome behind (see killBrowsersUnder);
          // a survivor would break the next fixture's browser connection.
          void killBrowsersUnder(temp).then(() => {
            if (!reported && !cancelled && !timedOut) {
            crashed += 1;
            buffered.push(
              `✖ Fixture "${envelope.units[index]!.fixture.title}" — its process exited with code ${code} before reporting.`,
            );
            }
            resolve(code);
          });
        }),
      );
    };

    // Heartbeat: ship log lines, renew the lease, learn about a cancel.
    const flush = async () => {
      const batch = buffered.splice(0, 500);
      const res = await call(
        "POST",
        `/internal/runner/jobs/${jobId}/events`,
        jobId,
        JSON.stringify({ events: batch.map((line) => ({ kind: "log", line })) }),
        { leaseToken },
      ).catch(() => null);
      if (!res) {
        buffered.unshift(...batch); // web unreachable: retry next beat
        return;
      }
      if (res.status === 403) cancelled = true; // lease lost — stop
      else if (res.ok && ((await res.json()) as { cancel?: boolean }).cancel) cancelled = true;
      if (cancelled && child) killTree(child, childTemp);
    };
    const beat = setInterval(() => void flush(), HEARTBEAT_MS);
    const timer = setTimeout(() => {
      timedOut = true;
      buffered.push(`✖ Stopped after ${Math.round(envelope.limits.timeoutMs / 60_000)} minutes — the maximum run time.`);
      if (child) killTree(child, childTemp);
    }, envelope.limits.timeoutMs);

    // Fixtures run one after another, each in its own process.
    for (let index = 0; index < envelope.units.length && !cancelled && !timedOut; index++) {
      await runUnit(index);
    }
    clearInterval(beat);
    clearTimeout(timer);
    const code = crashed > 0 && units.length === 0 ? 1 : 0;

    // Upload failure artifacts, attach refs to their results.
    if (!cancelled) {
      for (const unit of units) {
        for (const item of unit.artifacts) {
          const refs = await uploadArtifacts(envelope, item as Parameters<typeof uploadArtifacts>[1], logLine);
          const result = unit.results.find((r) => r.id === item.resultId);
          if (result && Object.keys(refs).length > 0) result.details = { ...result.details, artifactRefs: refs };
        }
      }
    }
    while (buffered.length > 0 && !cancelled) await flush();

    const status = cancelled ? "cancelled" : timedOut ? "error" : units.length === 0 && code !== 0 ? "error" : "completed";
    const res = await call(
      "POST",
      `/internal/runner/jobs/${jobId}/complete`,
      jobId,
      JSON.stringify({
        status,
        error: timedOut ? "Run exceeded the maximum run time and was stopped" : status === "error" ? `The job process exited with code ${code}` : undefined,
        units: units.map((u) => ({ fixtureId: u.fixtureId, results: u.results })),
      }),
      { leaseToken },
    ).catch(() => null);
    log(`job ${jobId}: ${status} (complete → HTTP ${res?.status ?? "error"})`);
  } finally {
    if (child) killTree(child, childTemp);
    await rm(jobDir, { recursive: true, force: true }).catch(() => {});
  }
}

async function workerLoop(slot: number): Promise<void> {
  for (;;) {
    let res: Response | null = null;
    try {
      res = await call("POST", "/internal/runner/lease", LEASE_DELIVERY_ID, "{}");
    } catch (error) {
      log(`slot ${slot}: web app unreachable (${error instanceof Error ? error.message : error}); retrying`);
      await sleep(5_000);
      continue;
    }
    if (res.status === 204) {
      // The web app runs tests in-process right now — check back later.
      if (res.headers.get("x-testora-runner-mode") === "inprocess") await sleep(IDLE_BACKOFF_MS);
      continue;
    }
    if (!res.ok) {
      log(`slot ${slot}: lease refused (HTTP ${res.status} ${await res.text()}); retrying`);
      await sleep(IDLE_BACKOFF_MS);
      continue;
    }
    const envelope = (await res.json()) as RunnerEnvelope;
    try {
      await runJob(envelope);
    } catch (error) {
      log(`job ${envelope.jobId} failed in the runner:`, error);
    }
  }
}

if (!TOKEN || !SECRET) {
  log("TESTORA_RUNNER_TOKEN / TESTORA_RUNNER_SIGNING_SECRETS not set — runner disabled.");
  process.exit(0);
}
log(`pulling from ${BASE_URL} with ${CONCURRENCY} slot(s)`);
for (let slot = 1; slot <= CONCURRENCY; slot++) void workerLoop(slot);

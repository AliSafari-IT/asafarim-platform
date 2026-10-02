/**
 * One fixture of a runner job, in its own child process (#717, ADR 0004 §3) —
 * a fresh process per fixture, because several TestCafe instances (native
 * automation) in one process interfere at teardown. Started by
 * src/runner/main.ts with env = the job envelope's env + a few OS basics —
 * nothing else is inherited, so scripted code that reads
 * `globalThis.process.env` sees this run's values only. Runs each fixture's
 * generated spec with TestCafe and reports on stdout as JSON lines:
 *   { t: "log", line }                               a console line
 *   { t: "unit", fixtureId, results, artifacts }     a fixture's results +
 *                                                    local artifact paths
 *   { t: "unit-error", fixtureId, message }          a fixture that couldn't run
 * It holds no runner credentials: the parent uploads artifacts and reports.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runSpec, type UploadArtifactsInput } from "@/test-engine/executors/specRunner";
import type { TestCaseDefinition, TestFixtureDefinition } from "@/test-engine/types";

export interface ChildJobUnit {
  fixture: TestFixtureDefinition;
  cases: TestCaseDefinition[];
  specPath: string;
  screenshotsDir: string;
  domDir: string;
  videoDir: string;
}

export interface ChildJob {
  units: ChildJobUnit[];
  browser: string;
}

const out = (message: unknown) => process.stdout.write(`${JSON.stringify(message)}\n`);

async function main() {
  const jobDir = process.argv[2];
  const index = Number(process.argv[3]);
  if (!jobDir || !Number.isInteger(index)) throw new Error("usage: job.ts <jobDir> <unitIndex>");
  const job = JSON.parse(await readFile(path.join(jobDir, "job.json"), "utf8")) as ChildJob;

  for (const unit of job.units.slice(index, index + 1)) {
    const artifacts: Omit<UploadArtifactsInput, "log">[] = [];
    try {
      const results = await runSpec({
        specPath: unit.specPath,
        screenshotsDir: unit.screenshotsDir,
        domDir: unit.domDir,
        videoDir: unit.videoDir,
        fixture: unit.fixture,
        cases: unit.cases,
        browser: job.browser,
        onLog: (line) => out({ t: "log", line }),
        // Record where each failure's files are; the parent uploads them.
        uploadArtifacts: async ({ resultId, screenshotPath, domSnapshotPath, videoPath }) => {
          artifacts.push({ resultId, screenshotPath, domSnapshotPath, videoPath });
          return {};
        },
        artifactsDeferred: true,
      });
      out({ t: "unit", fixtureId: unit.fixture.fixtureId, results, artifacts });
    } catch (error) {
      out({ t: "unit-error", fixtureId: unit.fixture.fixtureId, message: error instanceof Error ? error.message : String(error) });
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    out({ t: "log", line: `✖ Runner job failed: ${error instanceof Error ? error.message : String(error)}` });
    process.exit(1);
  });

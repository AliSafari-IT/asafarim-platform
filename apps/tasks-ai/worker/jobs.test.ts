import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { JobFailureTracker, UNHEALTHY_AFTER, WORKER_JOBS, runCycle, type WorkerJob } from "./jobs";

const LOADER = "./worker/server-only-noop.mjs";

function fakeLog() {
  return { error: vi.fn(), info: vi.fn() };
}

describe("worker jobs (#787)", () => {
  it("lists every periodic job, each with its own pre-#787 failure message", () => {
    expect(WORKER_JOBS.map((j) => [j.name, j.failMsg])).toEqual([
      ["outbox", "outbox.drain_failed"],
      ["webhooks", "webhooks.drain_failed"],
      ["ratecounters", "ratecounters.prune_failed"],
      ["brief_delivery", "brief_delivery.sweep_failed"],
    ]);
  });

  it("every worker entry point loads the server-only shim, the Dockerfile included", () => {
    const pkg = JSON.parse(readFileSync(join(__dirname, "../package.json"), "utf8")) as { scripts: Record<string, string> };
    for (const script of ["worker:dev", "worker:start"]) {
      expect(pkg.scripts[script], script).toContain(`--import ${LOADER}`);
    }
    const dockerfile = readFileSync(join(__dirname, "../Dockerfile"), "utf8");
    expect(dockerfile).toContain(`CMD ["pnpm", "exec", "tsx", "--import", "${LOADER}", "worker/index.ts"]`);
  });
});

describe("JobFailureTracker", () => {
  it("logs every failure, alerts once at the threshold, and recovers on success", () => {
    const log = fakeLog();
    const t = new JobFailureTracker(log);
    for (let i = 0; i < UNHEALTHY_AFTER + 2; i++) t.failed("webhooks", new Error("boom"), "webhooks.drain_failed");

    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ job: "webhooks", consecutive: 1 }), "webhooks.drain_failed");
    const alerts = log.error.mock.calls.filter(([, msg]) => msg === "worker.job_unhealthy");
    expect(alerts).toHaveLength(1); // once, not on every later failure
    expect(t.unhealthy()).toEqual(["webhooks"]);

    t.succeeded("webhooks");
    expect(t.unhealthy()).toEqual([]);
    expect(log.info).toHaveBeenCalledWith({ job: "webhooks", failures: UNHEALTHY_AFTER + 2 }, "worker.job_recovered");
  });

  it("isn't unhealthy below the threshold, and a success resets the count", () => {
    const t = new JobFailureTracker(fakeLog());
    for (let i = 0; i < UNHEALTHY_AFTER - 1; i++) t.failed("outbox", "x");
    t.succeeded("outbox");
    for (let i = 0; i < UNHEALTHY_AFTER - 1; i++) t.failed("outbox", "x");
    expect(t.unhealthy()).toEqual([]);
  });
});

describe("runCycle", () => {
  it("logs the job's report line on success and tracks a throw as a failure", async () => {
    const log = fakeLog();
    const t = new JobFailureTracker(log);
    const ok: WorkerJob = {
      name: "j",
      intervalMs: 1,
      failMsg: "j.failed",
      run: async () => 3,
      report: (n) => ({ fields: { n }, msg: "j.done" }),
    };
    await runCycle(ok, t, log);
    expect(log.info).toHaveBeenCalledWith({ n: 3 }, "j.done");

    const bad: WorkerJob = { ...ok, run: async () => Promise.reject(new Error("ERR_MODULE_NOT_FOUND")) };
    await runCycle(bad, t, log);
    expect(log.error).toHaveBeenCalledWith(expect.objectContaining({ job: "j", consecutive: 1 }), "j.failed");
  });
});

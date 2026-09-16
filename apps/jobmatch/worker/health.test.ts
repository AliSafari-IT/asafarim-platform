import { describe, expect, it } from "vitest";
import { buildWorkerHealth } from "./health";

describe("buildWorkerHealth", () => {
  it("is ok only when redis and database are both up", () => {
    const ok = buildWorkerHealth(true, true, new Date("2026-09-16T00:00:00Z"));
    expect(ok).toEqual({
      ok: true,
      service: "jobmatch-worker",
      checks: { redis: true, database: true },
      timestamp: "2026-09-16T00:00:00.000Z",
    });
  });

  it("is not ok when redis is down", () => {
    expect(buildWorkerHealth(false, true).ok).toBe(false);
  });

  it("is not ok when the database probe failed", () => {
    expect(buildWorkerHealth(true, false).ok).toBe(false);
  });
});

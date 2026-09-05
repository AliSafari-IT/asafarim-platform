import { describe, expect, it } from "vitest";
import { buildWorkerHealth } from "./health";

describe("buildWorkerHealth", () => {
  it("is ok only when redis and database are both up", () => {
    const ok = buildWorkerHealth(true, { ok: true }, new Date("2026-09-06T00:00:00Z"));
    expect(ok).toEqual({
      ok: true,
      service: "tasks-ai-worker",
      checks: { redis: true, database: true },
      timestamp: "2026-09-06T00:00:00.000Z",
    });
  });

  it("is not ok when redis is down", () => {
    expect(buildWorkerHealth(false, { ok: true }).ok).toBe(false);
  });

  it("is not ok when the database probe failed", () => {
    expect(buildWorkerHealth(true, { ok: false, error: "PrismaClientInitializationError" }).ok).toBe(
      false,
    );
  });
});

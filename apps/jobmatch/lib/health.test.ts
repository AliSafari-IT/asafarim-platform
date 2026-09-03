import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("health payload", () => {
  it("reports ok when every check passes", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => true, "0.1.0");
    expect(payload).toEqual({
      ok: true,
      service: "jobmatch",
      version: "0.1.0",
      checks: { process: true, database: true },
      timestamp: "1970-01-01T00:00:00.000Z",
    });
  });

  it("reports not-ok when the database is unreachable", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => false, "0.1.0");
    expect(payload.ok).toBe(false);
    expect(payload.checks.database).toBe(false);
  });

  it("exposes nothing about how the database is reached", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => false, "0.1.0");
    const serialized = JSON.stringify(payload);
    for (const leak of ["postgres", "jobmatch_dev", "5432", "55437", "@"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});

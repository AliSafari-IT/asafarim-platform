import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("health payload", () => {
  it("reports ok when every check passes", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => true, "0.1.0", []);
    expect(payload).toEqual({
      ok: true,
      service: "jobmatch",
      version: "0.1.0",
      checks: { process: true, database: true },
      warnings: [],
      timestamp: "1970-01-01T00:00:00.000Z",
    });
  });

  it("reports not-ok when the database is unreachable", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => false, "0.1.0", []);
    expect(payload.ok).toBe(false);
    expect(payload.checks.database).toBe(false);
  });

  it("exposes nothing about how the database is reached", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => false, "0.1.0", []);
    const serialized = JSON.stringify(payload);
    for (const leak of ["postgres", "jobmatch_dev", "5432", "55437", "@"]) {
      expect(serialized).not.toContain(leak);
    }
  });
});

describe("health warnings", () => {
  it("reports configuration warnings without failing the check", async () => {
    // A loopback sign-in URL in production is worth an operator's attention
    // and is not a reason to report the service as down.
    const payload = await buildHealthPayload(new Date(0), async () => true, "0.1.0", [
      "NEXT_PUBLIC_JOBMATCH_URL is unset or points at localhost",
    ]);
    expect(payload.ok).toBe(true);
    expect(payload.warnings).toHaveLength(1);
  });

  it("still names no values in a warning", async () => {
    const payload = await buildHealthPayload(new Date(0), async () => true, "0.1.0", [
      "NEXT_PUBLIC_HUB_URL is unset or points at localhost",
    ]);
    expect(JSON.stringify(payload)).not.toContain("://");
  });
});

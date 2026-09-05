import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("buildHealthPayload", () => {
  it("is ok when every check passes", async () => {
    const payload = await buildHealthPayload(
      new Date("2026-09-06T00:00:00Z"),
      async () => true,
      "1.2.3",
      [],
    );
    expect(payload).toMatchObject({
      ok: true,
      service: "tasks-ai",
      version: "1.2.3",
      checks: { process: true, database: true },
      warnings: [],
      timestamp: "2026-09-06T00:00:00.000Z",
    });
  });

  it("is not ok when the database check fails", async () => {
    const payload = await buildHealthPayload(new Date(), async () => false, "0.1.0", []);
    expect(payload.ok).toBe(false);
    expect(payload.checks.database).toBe(false);
  });

  it("carries warnings without flipping ok", async () => {
    const payload = await buildHealthPayload(
      new Date(),
      async () => true,
      "0.1.0",
      ["NEXT_PUBLIC_HUB_URL is unset or points at localhost"],
    );
    expect(payload.ok).toBe(true);
    expect(payload.warnings).toHaveLength(1);
  });
});

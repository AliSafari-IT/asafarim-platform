import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("buildHealthPayload", () => {
  it("reports ok with a service identity and timestamp when the database is reachable", async () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const payload = await buildHealthPayload(now, async () => true);

    expect(payload.ok).toBe(true);
    expect(payload.service).toBe("appbuilder");
    expect(payload.timestamp).toBe("2026-07-21T12:00:00.000Z");
    expect(payload.checks.process).toBe(true);
    expect(payload.checks.database).toBe(true);
  });

  it("reports not-ok when the database check fails", async () => {
    const payload = await buildHealthPayload(new Date(), async () => false);

    expect(payload.ok).toBe(false);
    expect(payload.checks.database).toBe(false);
  });

  it("defaults to the current time when none is given", async () => {
    const before = Date.now();
    const payload = await buildHealthPayload(undefined, async () => true);
    const after = Date.now();

    const ts = new Date(payload.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

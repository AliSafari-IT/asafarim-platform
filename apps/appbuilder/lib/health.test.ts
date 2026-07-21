import { describe, expect, it } from "vitest";
import { buildHealthPayload } from "./health";

describe("buildHealthPayload", () => {
  it("reports ok with a service identity and timestamp", () => {
    const now = new Date("2026-07-21T12:00:00.000Z");
    const payload = buildHealthPayload(now);

    expect(payload.ok).toBe(true);
    expect(payload.service).toBe("appbuilder");
    expect(payload.timestamp).toBe("2026-07-21T12:00:00.000Z");
    expect(payload.checks.process).toBe(true);
  });

  it("defaults to the current time when none is given", () => {
    const before = Date.now();
    const payload = buildHealthPayload();
    const after = Date.now();

    const ts = new Date(payload.timestamp).getTime();
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });
});

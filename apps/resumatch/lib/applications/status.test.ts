import { describe, expect, it } from "vitest";
import { appliedAtForStatusChange, describeTransition, statusAfterAcceptedEmail } from "./status";

describe("status after an accepted application email", () => {
  it("moves only Saved to Applied", () => {
    expect(statusAfterAcceptedEmail("SAVED")).toBe("APPLIED");
    for (const status of ["APPLIED", "INTERVIEWING", "OFFER", "REJECTED"] as const) expect(statusAfterAcceptedEmail(status)).toBe(status);
  });
  it("describes the transition", () => {
    expect(describeTransition("SAVED", "APPLIED")).toBe("SAVED->APPLIED");
    expect(describeTransition("OFFER", "OFFER")).toBe("OFFER (unchanged)");
  });
});

describe("appliedAt on a manual status change", () => {
  const now = new Date("2026-11-21T12:00:00Z");
  const earlier = new Date("2026-11-01T12:00:00Z");
  it("is set the first time an application becomes Applied", () => {
    expect(appliedAtForStatusChange("SAVED", "APPLIED", null, now)).toEqual(now);
    expect(appliedAtForStatusChange("INTERVIEWING", "APPLIED", earlier, now)).toBeUndefined();
  });
  it("is cleared when moved back to Saved, and otherwise left alone", () => {
    expect(appliedAtForStatusChange("APPLIED", "SAVED", earlier, now)).toBeNull();
    expect(appliedAtForStatusChange("APPLIED", "SAVED", null, now)).toBeUndefined();
    expect(appliedAtForStatusChange("APPLIED", "INTERVIEWING", earlier, now)).toBeUndefined();
    expect(appliedAtForStatusChange("APPLIED", "APPLIED", earlier, now)).toBeUndefined();
  });
});

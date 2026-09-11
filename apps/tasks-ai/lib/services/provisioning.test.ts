import { describe, expect, it } from "vitest";
import { parseChecklistCriteria, provisionCheckRef } from "./provisioning";

describe("parseChecklistCriteria", () => {
  it("extracts unchecked and checked markdown checklist items", () => {
    const description = [
      "Some context paragraph.",
      "",
      "- [ ] A user can request a reset link by email",
      "- [x] The link expires after 30 minutes",
      "* [ ] An expired link shows a friendly error",
    ].join("\n");
    const criteria = parseChecklistCriteria(description);
    expect(criteria).toEqual([
      { ref: "ac_1", text: "A user can request a reset link by email" },
      { ref: "ac_2", text: "The link expires after 30 minutes" },
      { ref: "ac_3", text: "An expired link shows a friendly error" },
    ]);
  });

  it("ignores non-checklist lines and returns [] with no checklist", () => {
    expect(parseChecklistCriteria("Just a plain description.\n- a bullet, not a checkbox")).toEqual([]);
    expect(parseChecklistCriteria(null)).toEqual([]);
    expect(parseChecklistCriteria(undefined)).toEqual([]);
    expect(parseChecklistCriteria("")).toEqual([]);
  });

  it("refs are stable in document order regardless of check state", () => {
    const criteria = parseChecklistCriteria("- [x] first\n- [ ] second");
    expect(criteria.map((c) => c.ref)).toEqual(["ac_1", "ac_2"]);
  });
});

describe("provisionCheckRef", () => {
  it("is deterministic per task id, so re-running the action re-syncs the same check", () => {
    expect(provisionCheckRef("task_1")).toBe(provisionCheckRef("task_1"));
    expect(provisionCheckRef("task_1")).not.toBe(provisionCheckRef("task_2"));
  });
});

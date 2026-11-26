import { describe, expect, it } from "vitest";
import type { FitAnalysis } from "./contract";
import { applyOverlay } from "./overlay";

const analysis: FitAnalysis = {
  version: "fit_assessment@1",
  method: "ai",
  requirements: [
    { id: "req_a", quote: "Kubernetes", priority: "required", category: "skill", essential: false, groupId: null, protectedTrait: false },
    { id: "req_b", quote: "React", priority: "required", category: "skill", essential: false, groupId: null, protectedTrait: false },
  ],
  assessments: [
    { requirementId: "req_a", judgment: "unknown", citations: [], explanation: "", equivalence: null, flags: [] },
    { requirementId: "req_b", judgment: "direct", citations: [{ sourceId: "skills", quote: "React" }], explanation: "", equivalence: null, flags: [] },
  ],
  completeness: { jobTruncated: false, profileSentencesOmitted: 0, requirementsCapped: false },
  validation: { requirementsRejected: 0, citationsRejected: 0, judgmentsDowngraded: 0 },
};

describe("fit overlay (#971)", () => {
  it("a 'no' marks unknown as unmet and turns support into a conflict", () => {
    const rows = applyOverlay(
      analysis,
      [
        { id: "1", requirementId: "req_a", answer: "no", evidenceRevisionId: null, evidenceText: null, createdAt: "2026-11-26T10:00:00Z" },
        { id: "2", requirementId: "req_b", answer: "no", evidenceRevisionId: null, evidenceText: null, createdAt: "2026-11-26T10:00:00Z" },
      ],
      [],
    );
    expect(rows.map((r) => r.assessment.judgment)).toEqual(["unmet", "conflict"]);
    expect(rows[0]!.answeredBy).toBe("no");
  });

  it("a confirmed 'yes' cites the candidate's own evidence", () => {
    const rows = applyOverlay(
      analysis,
      [{ id: "1", requirementId: "req_a", answer: "yes", evidenceRevisionId: "rev1", evidenceText: "Ran Kubernetes clusters at Acme.", createdAt: "2026-11-26T10:00:00Z" }],
      [],
    );
    expect(rows[0]!.assessment).toMatchObject({ judgment: "direct", citations: [{ sourceId: "ev:rev1", quote: "Ran Kubernetes clusters at Acme." }] });
  });

  it("the latest correction wins, keeps the original priority, and restore undoes it", () => {
    const corrected = applyOverlay(analysis, [], [{ id: "c1", requirementId: "req_a", action: "priority", priority: "preferred", createdAt: "2026-11-26T10:00:00Z" }]);
    expect(corrected[0]).toMatchObject({ requirement: { priority: "preferred" }, priorityCorrectedFrom: "required" });
    const removed = applyOverlay(analysis, [], [
      { id: "c1", requirementId: "req_a", action: "priority", priority: "preferred", createdAt: "2026-11-26T10:00:00Z" },
      { id: "c2", requirementId: "req_a", action: "not_requirement", priority: null, createdAt: "2026-11-26T10:01:00Z" },
    ]);
    expect(removed[0]!.removed).toBe(true);
    const restored = applyOverlay(analysis, [], [
      { id: "c2", requirementId: "req_a", action: "not_requirement", priority: null, createdAt: "2026-11-26T10:01:00Z" },
      { id: "c3", requirementId: "req_a", action: "restore", priority: null, createdAt: "2026-11-26T10:02:00Z" },
    ]);
    expect(restored[0]).toMatchObject({ removed: false, priorityCorrectedFrom: null });
  });
});

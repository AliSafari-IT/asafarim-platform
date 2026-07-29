import { describe, it, expect } from "vitest";
import { ModificationDecision, countDecisionOperations, MAX_MODIFICATION_PLAN_STEPS } from "./modificationDecision";

const validBatch = {
  reasoningSummary: "Adds a field.",
  isFinalBatch: true,
  operations: [
    { modelBelievesDestructive: false, operation: { opVersion: "1.0.0", type: "ARCHIVE_ENTITY", entityId: "task" } },
  ],
};

const validQuestion = {
  id: "q1",
  text: "Which page did you mean?",
  choices: [
    { id: "c1", label: "Home" },
    { id: "c2", label: "Marketing Home" },
  ],
  allowFreeText: true,
};

describe("ModificationDecision", () => {
  it("accepts a ready decision with one step", () => {
    const parsed = ModificationDecision.safeParse({
      outcome: "ready",
      summary: "Renames the page.",
      assumptions: [],
      plan: [{ title: "Rename page", batch: validBatch }],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a needs_clarification decision with a 2-5 choice question", () => {
    const parsed = ModificationDecision.safeParse({ outcome: "needs_clarification", question: validQuestion });
    expect(parsed.success).toBe(true);
  });

  it("rejects a needs_clarification question with only one choice", () => {
    const parsed = ModificationDecision.safeParse({
      outcome: "needs_clarification",
      question: { ...validQuestion, choices: [validQuestion.choices[0]] },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a partially_supported decision with plan and unsupported gaps", () => {
    const parsed = ModificationDecision.safeParse({
      outcome: "partially_supported",
      summary: "Some of this is representable.",
      assumptions: [],
      plan: [{ title: "Add page", batch: validBatch }],
      unsupported: [{ requested: "animation", reason: "no such property", classification: "schema" }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects partially_supported with an empty unsupported array (nothing owed to disclose)", () => {
    const parsed = ModificationDecision.safeParse({
      outcome: "partially_supported",
      summary: "x",
      assumptions: [],
      plan: [{ title: "Add page", batch: validBatch }],
      unsupported: [],
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts an unsupported decision with alternatives", () => {
    const parsed = ModificationDecision.safeParse({
      outcome: "unsupported",
      unsupported: [{ requested: "run a script", reason: "never executes arbitrary code", classification: "schema" }],
      alternatives: [{ description: "Use a bounded workflow action instead." }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects a plan longer than MAX_MODIFICATION_PLAN_STEPS", () => {
    const tooMany = Array.from({ length: MAX_MODIFICATION_PLAN_STEPS + 1 }, (_, i) => ({ title: `Step ${i}`, batch: validBatch }));
    const parsed = ModificationDecision.safeParse({ outcome: "ready", summary: "x", assumptions: [], plan: tooMany });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown outcome discriminator", () => {
    const parsed = ModificationDecision.safeParse({ outcome: "maybe", summary: "x" });
    expect(parsed.success).toBe(false);
  });
});

describe("countDecisionOperations", () => {
  it("sums operations across every step of a ready plan", () => {
    const decision = ModificationDecision.parse({
      outcome: "ready",
      summary: "x",
      assumptions: [],
      plan: [
        { title: "Step 1", batch: validBatch },
        { title: "Step 2", batch: validBatch },
      ],
    });
    expect(countDecisionOperations(decision)).toBe(2);
  });

  it("is zero for needs_clarification and unsupported outcomes", () => {
    const clarification = ModificationDecision.parse({ outcome: "needs_clarification", question: validQuestion });
    const unsupported = ModificationDecision.parse({
      outcome: "unsupported",
      unsupported: [{ requested: "x", reason: "y", classification: "schema" }],
    });
    expect(countDecisionOperations(clarification)).toBe(0);
    expect(countDecisionOperations(unsupported)).toBe(0);
  });
});

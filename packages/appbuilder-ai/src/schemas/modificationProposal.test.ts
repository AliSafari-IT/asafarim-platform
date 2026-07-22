import { describe, it, expect } from "vitest";
import { ModificationProposal, countModificationOperations } from "./modificationProposal";

const validOp = {
  modelBelievesDestructive: false,
  operation: { opVersion: "1.0.0", type: "ADD_FIELD", entityId: "task", field: { id: "priority", machineName: "priority", name: "Priority", type: "text", required: false, unique: false, archived: false } },
};

describe("ModificationProposal", () => {
  it("accepts a well-formed proposal", () => {
    const result = ModificationProposal.safeParse({
      summary: "Adds a priority field.",
      batch: { operations: [validOp], reasoningSummary: "Adds priority.", isFinalBatch: true },
    });
    expect(result.success).toBe(true);
  });

  it("defaults clarificationNeeded to false when omitted", () => {
    const result = ModificationProposal.safeParse({
      summary: "Adds a priority field.",
      batch: { operations: [validOp], reasoningSummary: "Adds priority.", isFinalBatch: true },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.clarificationNeeded).toBe(false);
  });

  it("accepts an empty operations batch when clarification is needed", () => {
    const result = ModificationProposal.safeParse({
      summary: "This request is too vague — what should change?",
      clarificationNeeded: true,
      batch: { operations: [], reasoningSummary: "Too vague to act on.", isFinalBatch: true },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing summary", () => {
    const result = ModificationProposal.safeParse({
      batch: { operations: [], reasoningSummary: "x", isFinalBatch: true },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an operation outside the allowlisted union — reuses OperationBatch's own validation", () => {
    const result = ModificationProposal.safeParse({
      summary: "Runs a script.",
      batch: {
        operations: [{ modelBelievesDestructive: false, operation: { opVersion: "1.0.0", type: "EXECUTE_SHELL_COMMAND", command: "rm -rf /" } }],
        reasoningSummary: "x",
        isFinalBatch: true,
      },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a smuggled confirmDestructive on a proposed operation", () => {
    const result = ModificationProposal.safeParse({
      summary: "Archives an entity, pre-confirmed.",
      batch: {
        operations: [{ modelBelievesDestructive: true, confirmDestructive: true, operation: { opVersion: "1.0.0", type: "ARCHIVE_ENTITY", entityId: "task" } }],
        reasoningSummary: "x",
        isFinalBatch: true,
      },
    });
    expect(result.success).toBe(true); // parses — but the field is stripped, never becomes a trusted flag
    if (result.success) {
      const op = result.data.batch.operations[0] as Record<string, unknown>;
      expect(op.confirmDestructive).toBeUndefined();
    }
  });
});

describe("countModificationOperations", () => {
  it("counts the operations in the batch", () => {
    const proposal = ModificationProposal.parse({
      summary: "x",
      batch: { operations: [validOp, validOp], reasoningSummary: "x", isFinalBatch: true },
    });
    expect(countModificationOperations(proposal)).toBe(2);
  });
});

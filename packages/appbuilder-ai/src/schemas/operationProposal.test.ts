import { describe, it, expect } from "vitest";
import { OperationBatch, ProposedOperation } from "./operationProposal";
import { PLANNING_LIMITS } from "../constants";

const validOp = {
  modelBelievesDestructive: false,
  operation: {
    opVersion: "1.0.0",
    type: "ARCHIVE_ENTITY",
    entityId: "task",
  },
};

describe("ProposedOperation", () => {
  it("accepts a real allowlisted operation", () => {
    expect(ProposedOperation.safeParse(validOp).success).toBe(true);
  });

  it("rejects an operation type outside the allowlisted union", () => {
    const forbidden = { ...validOp, operation: { opVersion: "1.0.0", type: "EXECUTE_SHELL_COMMAND", command: "rm -rf /" } };
    expect(ProposedOperation.safeParse(forbidden).success).toBe(false);
  });

  it("rejects a smuggled confirmDestructive-style field on the proposed-operation wrapper", () => {
    // The model has no field on ProposedOperation for self-approving a destructive change —
    // an extra field here must not silently create one via a permissive schema.
    const parsed = ProposedOperation.safeParse({ ...validOp, confirmDestructive: true });
    // zod object() strips unknown keys by default rather than rejecting them, so assert
    // the parsed value carries no such field rather than asserting parse failure.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).confirmDestructive).toBeUndefined();
    }
  });
});

describe("OperationBatch", () => {
  it("accepts an empty operations array when isFinalBatch is true (template already sufficient)", () => {
    expect(OperationBatch.safeParse({ operations: [], reasoningSummary: "Nothing more needed.", isFinalBatch: true }).success).toBe(
      true,
    );
  });

  it("rejects a batch larger than MAX_OPERATIONS_PER_BATCH", () => {
    const tooMany = Array.from({ length: PLANNING_LIMITS.MAX_OPERATIONS_PER_BATCH + 1 }, () => validOp);
    expect(
      OperationBatch.safeParse({ operations: tooMany, reasoningSummary: "Too many.", isFinalBatch: false }).success,
    ).toBe(false);
  });

  it("rejects a batch missing reasoningSummary", () => {
    expect(OperationBatch.safeParse({ operations: [validOp], isFinalBatch: true }).success).toBe(false);
  });
});

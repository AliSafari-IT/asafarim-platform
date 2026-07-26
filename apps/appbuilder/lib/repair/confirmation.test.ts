import { describe, expect, it } from "vitest";
import { computeRepairProposalChecksum, repairConfirmationExpiresAt, checkRepairConfirmation } from "./confirmation";
import type { repairAttempts } from "../db/schema";

type RepairAttemptRow = typeof repairAttempts.$inferSelect;

function attempt(overrides: Partial<RepairAttemptRow>): RepairAttemptRow {
  return {
    id: "attempt-1",
    confirmationRequired: true,
    confirmationChecksum: "abc123",
    confirmationBaseVersionNumber: 5,
    confirmationExpiresAt: new Date(Date.now() + 60_000),
    confirmationConfirmedAt: null,
    ...overrides,
  } as RepairAttemptRow;
}

describe("computeRepairProposalChecksum", () => {
  it("is deterministic for the same operations", () => {
    const ops = [{ type: "SET_PERMISSION", permission: { roleId: "manager", entityId: "task", verb: "delete", effect: "deny" } }];
    expect(computeRepairProposalChecksum(ops)).toBe(computeRepairProposalChecksum(ops));
  });

  it("differs for different operations", () => {
    const a = computeRepairProposalChecksum([{ type: "SET_PERMISSION", permission: { roleId: "manager" } }]);
    const b = computeRepairProposalChecksum([{ type: "SET_PERMISSION", permission: { roleId: "employee_role" } }]);
    expect(a).not.toBe(b);
  });
});

describe("repairConfirmationExpiresAt", () => {
  it("returns a time in the future relative to `from`", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    expect(repairConfirmationExpiresAt(from).getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("checkRepairConfirmation", () => {
  it("returns 'not_required' when confirmation was never required", () => {
    expect(checkRepairConfirmation(attempt({ confirmationRequired: false }), { checksum: "abc123", currentVersionNumber: 5 })).toBe("not_required");
  });

  it("returns 'already_confirmed' when already confirmed", () => {
    expect(checkRepairConfirmation(attempt({ confirmationConfirmedAt: new Date() }), { checksum: "abc123", currentVersionNumber: 5 })).toBe("already_confirmed");
  });

  it("returns 'expired' when the confirmation window has passed", () => {
    expect(checkRepairConfirmation(attempt({ confirmationExpiresAt: new Date(Date.now() - 1000) }), { checksum: "abc123", currentVersionNumber: 5 })).toBe("expired");
  });

  it("returns 'checksum_mismatch' when the checksum doesn't match the reviewed proposal", () => {
    expect(checkRepairConfirmation(attempt({}), { checksum: "different", currentVersionNumber: 5 })).toBe("checksum_mismatch");
  });

  it("returns 'base_version_changed' when the spec moved on since the proposal was reviewed", () => {
    expect(checkRepairConfirmation(attempt({}), { checksum: "abc123", currentVersionNumber: 6 })).toBe("base_version_changed");
  });

  it("returns null (valid) when checksum and version both match and nothing has expired/confirmed yet", () => {
    expect(checkRepairConfirmation(attempt({}), { checksum: "abc123", currentVersionNumber: 5 })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { checkConfirmation, computeProposalChecksum, confirmationExpiresAt } from "./confirmation";

function makeJob(overrides: Partial<Parameters<typeof checkConfirmation>[0]> = {}) {
  return {
    confirmationRequired: true,
    confirmationConfirmedAt: null,
    confirmationExpiresAt: new Date(Date.now() + 60_000),
    confirmationChecksum: "abc123",
    confirmationBaseVersionNumber: 5,
    ...overrides,
  } as Parameters<typeof checkConfirmation>[0];
}

describe("computeProposalChecksum", () => {
  it("is deterministic for the same operations", () => {
    const ops = [{ type: "ARCHIVE_ENTITY", entityId: "task" }];
    expect(computeProposalChecksum(ops)).toBe(computeProposalChecksum(ops));
  });

  it("differs when the operations differ", () => {
    const a = computeProposalChecksum([{ type: "ARCHIVE_ENTITY", entityId: "task" }]);
    const b = computeProposalChecksum([{ type: "ARCHIVE_ENTITY", entityId: "project" }]);
    expect(a).not.toBe(b);
  });

  it("differs by order (operations array order is meaningful)", () => {
    const a = computeProposalChecksum([{ id: 1 }, { id: 2 }]);
    const b = computeProposalChecksum([{ id: 2 }, { id: 1 }]);
    expect(a).not.toBe(b);
  });
});

describe("confirmationExpiresAt", () => {
  it("returns a time in the future relative to the given instant", () => {
    const from = new Date("2026-01-01T00:00:00Z");
    const expires = confirmationExpiresAt(from);
    expect(expires.getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("checkConfirmation", () => {
  it("passes for a valid, unexpired, matching confirmation", () => {
    expect(checkConfirmation(makeJob(), { checksum: "abc123", currentVersionNumber: 5 })).toBeNull();
  });

  it("rejects when confirmation was never required", () => {
    expect(checkConfirmation(makeJob({ confirmationRequired: false }), { checksum: "abc123", currentVersionNumber: 5 })).toBe(
      "not_required",
    );
  });

  it("rejects (idempotently, not an error) when already confirmed", () => {
    expect(
      checkConfirmation(makeJob({ confirmationConfirmedAt: new Date() }), { checksum: "abc123", currentVersionNumber: 5 }),
    ).toBe("already_confirmed");
  });

  it("rejects an expired confirmation window", () => {
    expect(
      checkConfirmation(makeJob({ confirmationExpiresAt: new Date(Date.now() - 1000) }), {
        checksum: "abc123",
        currentVersionNumber: 5,
      }),
    ).toBe("expired");
  });

  it("rejects a missing expiry as expired (fail closed)", () => {
    expect(
      checkConfirmation(makeJob({ confirmationExpiresAt: null }), { checksum: "abc123", currentVersionNumber: 5 }),
    ).toBe("expired");
  });

  it("rejects a checksum that doesn't match the exact reviewed proposal", () => {
    expect(checkConfirmation(makeJob(), { checksum: "forged-checksum", currentVersionNumber: 5 })).toBe("checksum_mismatch");
  });

  it("rejects when the base version changed since the proposal was shown", () => {
    expect(checkConfirmation(makeJob(), { checksum: "abc123", currentVersionNumber: 6 })).toBe("base_version_changed");
  });
});

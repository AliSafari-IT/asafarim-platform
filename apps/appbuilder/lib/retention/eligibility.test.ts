import { describe, expect, it } from "vitest";
import {
  isAiJobDiagnosticEligible,
  isConversationMessageEligible,
  isValidationArtifactEligible,
} from "./eligibility";

const NOW = new Date("2026-07-01T00:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("isValidationArtifactEligible", () => {
  it("is not eligible without a retentionExpiresAt", () => {
    expect(
      isValidationArtifactEligible({ retentionExpiresAt: null }, NOW)
    ).toBe(false);
  });

  it("is not eligible before its retentionExpiresAt", () => {
    expect(
      isValidationArtifactEligible(
        { retentionExpiresAt: new Date(NOW.getTime() + 1000) },
        NOW
      )
    ).toBe(false);
  });

  it("is eligible once past its retentionExpiresAt", () => {
    expect(
      isValidationArtifactEligible(
        { retentionExpiresAt: new Date(NOW.getTime() - 1000) },
        NOW
      )
    ).toBe(true);
  });
});

describe("isConversationMessageEligible", () => {
  it("is never eligible on an active app, regardless of age", () => {
    expect(
      isConversationMessageEligible(
        { createdAt: days(9999) },
        { status: "active" },
        NOW
      )
    ).toBe(false);
  });

  it("is not eligible on an archived app within the retention window", () => {
    expect(
      isConversationMessageEligible(
        { createdAt: days(10) },
        { status: "archived" },
        NOW
      )
    ).toBe(false);
  });

  it("is eligible on an archived app past the retention window", () => {
    expect(
      isConversationMessageEligible(
        { createdAt: days(181) },
        { status: "archived" },
        NOW
      )
    ).toBe(true);
  });
});

describe("isAiJobDiagnosticEligible", () => {
  it("is never eligible for a non-terminal job", () => {
    expect(
      isAiJobDiagnosticEligible({ status: "queued", completedAt: null }, NOW)
    ).toBe(false);
  });

  it("is not eligible for a recently completed terminal job", () => {
    expect(
      isAiJobDiagnosticEligible({ status: "ready", completedAt: days(1) }, NOW)
    ).toBe(false);
  });

  it("is eligible for a terminal job completed past the retention window", () => {
    expect(
      isAiJobDiagnosticEligible(
        { status: "failed", completedAt: days(91) },
        NOW
      )
    ).toBe(true);
  });
});

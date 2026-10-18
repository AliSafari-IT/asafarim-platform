/** Issue #539: the student page names a spend-control block's reason. */
import { describe, expect, it } from "vitest";
import { aiErrorMessageKey } from "@/lib/ai-blocked";
import { edumatchDictionaries } from "@/lib/i18n-dictionaries";

describe("aiErrorMessageKey", () => {
  it("maps each block reason to its own message", () => {
    expect(aiErrorMessageKey({ error: "ai_blocked", reason: "disabled" })).toBe(
      "edumatch.inquiry.detail.aiPaused"
    );
    expect(aiErrorMessageKey({ error: "ai_blocked", reason: "budget" })).toBe(
      "edumatch.inquiry.detail.aiBudgetReached"
    );
    expect(
      aiErrorMessageKey({ error: "ai_blocked", reason: "student_quota" })
    ).toBe("edumatch.inquiry.detail.aiStudentQuotaReached");
  });

  it("keeps the generic message for anything else", () => {
    for (const body of [
      null,
      "oops",
      { error: "An AI response for this inquiry is already in progress." },
      { error: "ai_blocked", reason: "toString" },
      { error: "ai_blocked" },
    ]) {
      expect(aiErrorMessageKey(body)).toBe(
        "edumatch.inquiry.detail.aiUnavailable"
      );
    }
  });

  it("has every message in each locale that has the generic one", () => {
    const keys = [
      "edumatch.inquiry.detail.aiPaused",
      "edumatch.inquiry.detail.aiBudgetReached",
      "edumatch.inquiry.detail.aiStudentQuotaReached",
    ];
    for (const [locale, dict] of Object.entries(edumatchDictionaries)) {
      const entries = dict as Record<string, string>;
      if (!entries["edumatch.inquiry.detail.aiUnavailable"]) continue;
      for (const key of keys)
        expect(entries[key], `${locale} ${key}`).toBeTruthy();
    }
    expect(
      (edumatchDictionaries.en as Record<string, string>)[
        "edumatch.inquiry.detail.aiPaused"
      ]
    ).toBeTruthy();
  });
});

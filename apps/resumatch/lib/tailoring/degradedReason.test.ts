import { describe, expect, it } from "vitest";
import { getServerTranslator } from "@asafarim/shared-i18n/server";
import resumatchDictionaries from "../i18n-dictionaries";
import { degradedMessage, formatResetDate, isDegradedReason } from "./degradedReason";

describe("degradedMessage (#756)", () => {
  const en = getServerTranslator("en", resumatchDictionaries);
  const nl = getServerTranslator("nl-BE", resumatchDictionaries);

  it("says which ceiling was reached and when it resets", () => {
    expect(degradedMessage(en, "resumatch.review.degraded", "workspace_budget", "2026-12-01", "en")).toBe(
      "Your monthly AI budget is used up, so this CV wasn't AI-tailored. It resets on December 1, 2026. You can still save your confirmed profile as this tailored CV, unchanged.",
    );
    expect(degradedMessage(en, "resumatch.review.degraded", "global_budget", "2026-12-01", "en")).toMatch(
      /^The service-wide AI budget for this month is used up.*December 1, 2026/,
    );
    expect(degradedMessage(nl, "resumatch.review.degraded", "workspace_budget", "2026-12-01", "nl-BE")).toMatch(
      /^Je maandelijkse AI-budget is op.*1 december 2026/,
    );
  });

  it("says a provider failure is not a budget problem", () => {
    const message = degradedMessage(en, "resumatch.review.degraded", "provider", "2026-12-01", "en");
    expect(message).toMatch(/AI provider isn't available/);
    expect(message).not.toMatch(/budget/i);
  });

  it("has a letter message for every cause, grounding included", () => {
    for (const reason of ["workspace_budget", "global_budget", "provider", "grounding"] as const) {
      const message = degradedMessage(en, "resumatch.review.cl.degraded", reason, "2026-12-01", "en");
      expect(message).toMatch(/^No cover letter was drafted/);
    }
  });

  it("falls back to the generic message without a reason or a reset date", () => {
    expect(degradedMessage(en, "resumatch.review.degraded", null, "2026-12-01", "en")).toBe(en("resumatch.review.degraded"));
    expect(degradedMessage(en, "resumatch.review.cl.degraded", "workspace_budget", null, "en")).toBe(
      en("resumatch.review.cl.degraded"),
    );
  });

  it("is translated in every locale ResuMatch ships", () => {
    for (const locale of ["en", "nl-BE", "fr-BE", "de-BE"] as const) {
      const t = getServerTranslator(locale, resumatchDictionaries);
      for (const key of [
        "resumatch.review.degraded.workspace_budget",
        "resumatch.review.degraded.global_budget",
        "resumatch.review.degraded.provider",
        "resumatch.review.cl.degraded.grounding",
        "resumatch.cost.budget.line",
        "resumatch.cost.budget.globalReached",
      ]) {
        expect(t(key, { date: "x", spent: "x", budget: "x" }), `${locale} ${key}`).not.toBe(key);
      }
    }
  });
});

describe("helpers", () => {
  it("formats the reset date in UTC", () => {
    expect(formatResetDate("2027-01-01", "en")).toBe("January 1, 2027");
    expect(formatResetDate("not-a-date", "en")).toBe("not-a-date");
  });

  it("accepts only known reasons from the response", () => {
    expect(isDegradedReason("global_budget")).toBe(true);
    expect(isDegradedReason("grounding")).toBe(false);
    expect(isDegradedReason(null)).toBe(false);
  });
});

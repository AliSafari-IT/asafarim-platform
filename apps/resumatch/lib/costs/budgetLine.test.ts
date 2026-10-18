import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getServerTranslator } from "@asafarim/shared-i18n/server";
import resumatchDictionaries from "../i18n-dictionaries";
import { BudgetLine } from "../../app/ai-usage/BudgetLine";

const t = getServerTranslator("en", resumatchDictionaries);

describe("BudgetLine (issue #514)", () => {
  it("shows this month's spend against the budget in effect", () => {
    const html = renderToStaticMarkup(
      createElement(BudgetLine, {
        budget: { monthUsd: 1.5, budgetUsd: 10 },
        t,
        locale: "en",
      })
    );
    expect(html).toContain("AI budget this month");
    expect(html).toContain("$1.50 of $10.00");
    expect(html).not.toContain("Budget reached");
  });

  it("says so when the budget is reached", () => {
    const html = renderToStaticMarkup(
      createElement(BudgetLine, {
        budget: { monthUsd: 10, budgetUsd: 10 },
        t,
        locale: "en",
      })
    );
    expect(html).toContain("Budget reached");
  });

  it("is translated in every language", () => {
    for (const locale of ["nl-BE", "fr-BE", "de-BE"] as const) {
      const tl = getServerTranslator(locale, resumatchDictionaries);
      const html = renderToStaticMarkup(
        createElement(BudgetLine, {
          budget: { monthUsd: 0, budgetUsd: 5 },
          t: tl,
          locale,
        })
      );
      expect(html).not.toContain("resumatch.cost.budget");
      expect(html).not.toContain("AI budget this month");
    }
  });
});

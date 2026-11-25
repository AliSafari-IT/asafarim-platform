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

describe("BudgetLine reset date and service-wide ceiling (issue #756)", () => {
  const render = (budget: Parameters<typeof BudgetLine>[0]["budget"], compact = false, locale: Parameters<typeof getServerTranslator>[0] = "en") =>
    renderToStaticMarkup(
      createElement(BudgetLine, { budget, t: locale === "en" ? t : getServerTranslator(locale, resumatchDictionaries), locale, compact }),
    );

  it("compact: one line with spend, ceiling, reset date and a details link", () => {
    const html = render({ monthUsd: 1.5, budgetUsd: 20, resetsOn: "2026-12-01", globalReached: false }, true);
    expect(html).toContain("AI this month: $1.50 of $20.00. Resets on December 1, 2026.");
    expect(html).toContain('href="/ai-usage"');
    expect(html).not.toContain('role="status"');
  });

  it("compact: says the candidate's own budget is used up, with the date", () => {
    const html = render({ monthUsd: 20, budgetUsd: 20, resetsOn: "2026-12-01", globalReached: true }, true);
    expect(html).toContain("Your monthly AI budget is used up. AI steps pause until December 1, 2026.");
    // Their own ceiling is the one to name when both are reached.
    expect(html).not.toContain("service-wide");
  });

  it("compact: says the service-wide budget is used up while theirs has room", () => {
    const html = render({ monthUsd: 1, budgetUsd: 20, resetsOn: "2026-12-01", globalReached: true }, true);
    expect(html).toContain("The service-wide AI budget for this month is used up. AI steps pause until December 1, 2026.");
  });

  it("full: the hint carries the reset date", () => {
    const html = render({ monthUsd: 1, budgetUsd: 20, resetsOn: "2026-12-01", globalReached: false });
    expect(html).toContain("Resets on December 1, 2026.");
  });

  it("compact is translated (Dutch)", () => {
    const html = render({ monthUsd: 1, budgetUsd: 20, resetsOn: "2026-12-01", globalReached: false }, true, "nl-BE");
    expect(html).toContain("AI deze maand:");
    expect(html).toContain("1 december 2026");
    expect(html).not.toContain("resumatch.cost.budget");
  });
});

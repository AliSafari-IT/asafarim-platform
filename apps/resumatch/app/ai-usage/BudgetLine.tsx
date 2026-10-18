import { Metric } from "@asafarim/ui";
import type { Translate } from "../../lib/costs/format";
import type { UsageSummary } from "../../lib/tailoring/ai/quota";

/**
 * "This month: $X of $Y AI budget" for the current workspace (issue #514).
 * Shows the ceiling in effect, not where it came from: whether an operator
 * set a per-workspace override is not the candidate's concern.
 */
export function BudgetLine({
  budget,
  t,
  locale,
}: {
  budget: Pick<UsageSummary, "monthUsd" | "budgetUsd">;
  t: Translate;
  locale: string;
}) {
  const usd = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
  return (
    <div
      className="rm-cost-summary"
      role="group"
      aria-label={t("resumatch.cost.budget.aria")}
    >
      <Metric
        label={t("resumatch.cost.budget.label")}
        value={t("resumatch.cost.budget.value", {
          spent: usd.format(budget.monthUsd),
          budget: usd.format(budget.budgetUsd),
        })}
        hint={t(
          budget.monthUsd >= budget.budgetUsd
            ? "resumatch.cost.budget.reached"
            : "resumatch.cost.budget.hint"
        )}
      />
    </div>
  );
}

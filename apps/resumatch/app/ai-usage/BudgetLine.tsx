import Link from "next/link";
import { Metric } from "@asafarim/ui";
import type { Translate } from "../../lib/costs/format";
import type { UsageSummary } from "../../lib/tailoring/ai/quota";
import { formatResetDate } from "../../lib/tailoring/degradedReason";

/**
 * "This month: $X of $Y AI budget" for the current workspace (issue #514).
 * Shows the ceiling in effect, not where it came from: whether an operator
 * set a per-workspace override is not the candidate's concern.
 *
 * Issue #756: also says when the budget resets and, when the service-wide
 * ceiling is reached, says so (never its amount). `compact` is the one-line
 * form shown on /tailor, linking to /ai-usage for the details.
 */
export function BudgetLine({
  budget,
  t,
  locale,
  compact = false,
}: {
  budget: Pick<UsageSummary, "monthUsd" | "budgetUsd"> & { resetsOn?: string; globalReached?: boolean };
  t: Translate;
  locale: string;
  compact?: boolean;
}) {
  const usd = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
  const spent = usd.format(budget.monthUsd);
  const ceiling = usd.format(budget.budgetUsd);
  const date = budget.resetsOn ? formatResetDate(budget.resetsOn, locale) : null;
  const reached = budget.monthUsd >= budget.budgetUsd;
  const pause = date
    ? reached
      ? t("resumatch.cost.budget.reachedOn", { date })
      : budget.globalReached
        ? t("resumatch.cost.budget.globalReached", { date })
        : null
    : reached
      ? t("resumatch.cost.budget.reached")
      : null;

  if (compact) {
    return (
      <p className="rm-budget-line" data-testid="tailor-budget-line">
        <span>
          {date
            ? t("resumatch.cost.budget.line", { spent, budget: ceiling, date })
            : `${t("resumatch.cost.budget.label")}: ${t("resumatch.cost.budget.value", { spent, budget: ceiling })}`}
        </span>
        {pause ? (
          <strong className="rm-budget-line__pause" role="status">
            {pause}
          </strong>
        ) : null}
        <Link href="/ai-usage" className="rx-link">
          {t("resumatch.cost.budget.details")}
        </Link>
      </p>
    );
  }

  return (
    <div
      className="rm-cost-summary"
      role="group"
      aria-label={t("resumatch.cost.budget.aria")}
    >
      <Metric
        label={t("resumatch.cost.budget.label")}
        value={t("resumatch.cost.budget.value", { spent, budget: ceiling })}
        hint={
          pause ??
          [t("resumatch.cost.budget.hint"), date ? t("resumatch.cost.budget.resets", { date }) : null]
            .filter(Boolean)
            .join(" ")
        }
      />
    </div>
  );
}

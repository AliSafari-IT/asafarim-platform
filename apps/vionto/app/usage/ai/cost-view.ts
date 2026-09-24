import { formatMicros } from "@asafarim/ai-cost-ledger";
import type { ViontoCostTimeline } from "@/lib/server/ai/cost-read";

/**
 * Display rules for one AI call (issue #589), framework-free so they are
 * unit-tested: `Actual`, `Estimated`, `Partially tracked`, `Not tracked`,
 * `BYOK` and `Free/fixture` must stay distinct in *text*, not colour, and
 * an unknown amount is never rendered as `$0.00`.
 */
export type CostItemView = ViontoCostTimeline["items"][number];

export interface BadgeView {
  key: string;
  labelKey: string;
  tone: "neutral" | "info" | "success" | "warning";
}

export function costStatusBadges(item: Pick<CostItemView, "basis" | "legacy" | "credentialSource">): BadgeView[] {
  const badges: BadgeView[] = [];
  if (item.legacy) badges.push({ key: "partial", labelKey: "vionto.aiUsage.status.partial", tone: "warning" });
  switch (item.basis) {
    case "actual":
      badges.push({ key: "actual", labelKey: "vionto.aiUsage.status.actual", tone: "success" });
      break;
    case "estimated":
    case "adjustment":
      badges.push({ key: "estimated", labelKey: "vionto.aiUsage.status.estimated", tone: "info" });
      break;
    case "fixture":
      badges.push({ key: "free", labelKey: "vionto.aiUsage.status.free", tone: "neutral" });
      break;
    case "unknown":
      badges.push({ key: "unknown", labelKey: "vionto.aiUsage.status.notTracked", tone: "warning" });
      break;
  }
  if (item.credentialSource === "user_byok") badges.push({ key: "byok", labelKey: "vionto.aiUsage.status.byok", tone: "neutral" });
  return badges;
}

export function itemAmountLabel(
  item: Pick<CostItemView, "amountMicros" | "basis">,
  locale: string,
  t: (key: string, vars?: Record<string, string | number>) => string,
): { text: string; aria: string; unknown: boolean } {
  if (item.amountMicros === null || item.basis === "unknown") {
    const text = t("vionto.aiUsage.status.notTracked");
    return { text, aria: text, unknown: true };
  }
  const text = formatMicros(BigInt(item.amountMicros), { locale });
  const status =
    item.basis === "actual"
      ? t("vionto.aiUsage.status.actual")
      : item.basis === "fixture"
        ? t("vionto.aiUsage.status.free")
        : t("vionto.aiUsage.status.estimated");
  return { text, aria: `${text} (${status})`, unknown: false };
}

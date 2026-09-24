import { Badge } from "@asafarim/ui";
import type { TimelineItemDTO } from "@asafarim/ai-cost-ledger";
import { amountDisplay, basisBadge, operationLabel, payerLabel, usageSummary } from "../../lib/costs/format";
import { LocalTime } from "./LocalTime";

/**
 * One provider call. Pure and props-only so it renders identically on the
 * server (first paint) and inside the client drill-downs. Status is
 * carried by text in the badge, never by colour alone.
 */
export function CostItem({ item }: { item: TimelineItemDTO }) {
  const amount = amountDisplay(item.amountMicros, item.basis);
  const badge = basisBadge(item.basis, item.legacy);
  return (
    <li className="rm-cost-item">
      <div className="rm-cost-item__when">
        <LocalTime iso={item.occurredAt} />
      </div>
      <div className="rm-cost-item__what">
        <strong>{operationLabel(item.operation)}</strong>
        {item.outcome !== "succeeded" ? (
          <span className="rm-cost-item__outcome"> · {item.outcome === "failed" ? "failed (still billed)" : item.outcome}</span>
        ) : null}
        <div className="rm-cost-item__meta">
          <span>
            {item.provider} / {item.model}
          </span>
          <span>{usageSummary(item.usage)}</span>
          <span>{payerLabel(item.credentialSource)}</span>
        </div>
      </div>
      <div className="rm-cost-item__status">
        <span title={badge.title}>
          <Badge tone={badge.tone}>{badge.text}</Badge>
        </span>
      </div>
      <div className={`rm-cost-item__amount rm-cost-amount--${amount.tone}`} aria-label={amount.label}>
        {amount.text}
      </div>
    </li>
  );
}

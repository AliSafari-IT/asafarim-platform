import { Badge } from "@asafarim/ui";
import type { TimelineItemDTO } from "@asafarim/ai-cost-ledger";
import {
  amountDisplay,
  basisBadge,
  operationLabel,
  outcomeLabel,
  payerLabel,
  usageSummary,
  type Translate,
} from "../../lib/costs/format";
import { LocalTime } from "./LocalTime";

/**
 * One provider call. Pure and props-only so it renders identically on the
 * server (first paint) and inside the client drill-downs — so it takes the
 * translate function and locale as props instead of reading a context.
 * Status is carried by text in the badge, never by colour alone.
 */
export function CostItem({ item, t, locale }: { item: TimelineItemDTO; t: Translate; locale?: string }) {
  const amount = amountDisplay(item.amountMicros, item.basis, t, locale);
  const badge = basisBadge(item.basis, item.legacy, t);
  return (
    <li className="rm-cost-item">
      <div className="rm-cost-item__when">
        <LocalTime iso={item.occurredAt} />
      </div>
      <div className="rm-cost-item__what">
        <strong>{operationLabel(item.operation, t)}</strong>
        {item.outcome !== "succeeded" ? (
          <span className="rm-cost-item__outcome"> · {outcomeLabel(item.outcome, t)}</span>
        ) : null}
        <div className="rm-cost-item__meta">
          <span>
            {item.provider} / {item.model}
          </span>
          <span>{usageSummary(item.usage, t, locale)}</span>
          <span>{payerLabel(item.credentialSource, t)}</span>
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

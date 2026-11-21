import { Badge, type BadgeTone } from "@asafarim/ui";
import { getTranslator } from "../../../lib/i18n-server";

const TONE: Record<string, BadgeTone> = {
  ACCEPTED: "success",
  FAILED: "danger",
  UNCERTAIN: "warning",
  SENDING: "info",
};

/** Send outcome, then delivery when a provider reports it. "Accepted" is
 *  never worded as "delivered". */
export async function SentStatusBadge({ status, delivery }: { status: string; delivery: string }) {
  const { t } = await getTranslator();
  return (
    <span className="rm-sent-status">
      <Badge tone={TONE[status] ?? "neutral"}>{t(`resumatch.sent.status.${status}`)}</Badge>
      {status === "ACCEPTED" ? (
        <span className="rm-sent-status__delivery">{t(`resumatch.sent.delivery.${delivery === "delivered" || delivery === "bounced" || delivery === "complained" ? delivery : "not_tracked"}`)}</span>
      ) : null}
    </span>
  );
}

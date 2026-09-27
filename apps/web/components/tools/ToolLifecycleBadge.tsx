import { Badge, type BadgeTone } from "@asafarim/ui";
import type { ToolLifecycle } from "../../lib/tools/types";

const LIFECYCLE_BADGES: Record<ToolLifecycle, { label: string; tone: BadgeTone }> = {
  experiment: { label: "Experimental", tone: "warning" },
  beta: { label: "Beta", tone: "info" },
  stable: { label: "Stable", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  retired: { label: "Retired", tone: "neutral" },
};

/** `label` overrides the English default with a translated one. */
export function ToolLifecycleBadge({ lifecycle, label }: { lifecycle: ToolLifecycle; label?: string }) {
  const badge = LIFECYCLE_BADGES[lifecycle];
  return <Badge tone={badge.tone}>{label ?? badge.label}</Badge>;
}

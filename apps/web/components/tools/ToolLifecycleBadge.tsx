import { Badge, type BadgeTone } from "@asafarim/ui";
import type { ToolLifecycle } from "../../lib/tools/types";

const LIFECYCLE_BADGES: Record<ToolLifecycle, { label: string; tone: BadgeTone }> = {
  experiment: { label: "Experimental", tone: "warning" },
  beta: { label: "Beta", tone: "info" },
  stable: { label: "Stable", tone: "success" },
  paused: { label: "Paused", tone: "warning" },
  retired: { label: "Retired", tone: "neutral" },
};

export function ToolLifecycleBadge({ lifecycle }: { lifecycle: ToolLifecycle }) {
  const { label, tone } = LIFECYCLE_BADGES[lifecycle];
  return <Badge tone={tone}>{label}</Badge>;
}

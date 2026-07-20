import type { BadgeTone } from "@asafarim/ui";
import type { JobState } from "../_data/types";

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function fmtUsd(usd: number | null | undefined): string {
  if (usd == null) return "—";
  return `$${usd.toFixed(4)}`;
}

export function stateBadge(state: JobState): { tone: BadgeTone; labelKey: string } {
  switch (state) {
    case "succeeded":
      return { tone: "success", labelKey: "showcase.vionto.state.succeeded" };
    case "failed":
      return { tone: "danger", labelKey: "showcase.vionto.state.failed" };
    case "cancelled":
      return { tone: "warning", labelKey: "showcase.vionto.state.cancelled" };
    case "awaiting-approval":
      return { tone: "info", labelKey: "showcase.vionto.state.awaiting-approval" };
    case "running":
      return { tone: "info", labelKey: "showcase.vionto.state.running" };
    case "queued":
    default:
      return { tone: "neutral", labelKey: "showcase.vionto.state.queued" };
  }
}

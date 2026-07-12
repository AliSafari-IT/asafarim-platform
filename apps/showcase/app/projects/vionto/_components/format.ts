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

export function stateBadge(state: JobState): { tone: BadgeTone; label: string } {
  switch (state) {
    case "succeeded":
      return { tone: "success", label: "Succeeded" };
    case "failed":
      return { tone: "danger", label: "Failed" };
    case "cancelled":
      return { tone: "warning", label: "Cancelled" };
    case "awaiting-approval":
      return { tone: "info", label: "Awaiting approval" };
    case "running":
      return { tone: "info", label: "Running" };
    case "queued":
    default:
      return { tone: "neutral", label: "Queued" };
  }
}

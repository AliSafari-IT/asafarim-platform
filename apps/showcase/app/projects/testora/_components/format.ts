import type { BadgeTone } from "@asafarim/ui";
import type { CaseStatus } from "../_data/types";

/** Map a benchmark case status to a Badge tone. */
export function statusTone(status: CaseStatus): BadgeTone {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
      return "danger";
    case "flaky":
      return "warning";
  }
}

/** Compact, deterministic duration formatting (mirrors report.ts fmtDuration). */
export function fmtDuration(ms: number | null): string {
  if (ms == null) return "—";
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`;
  const m = Math.floor(ms / 60000);
  const s = Math.round((ms % 60000) / 1000);
  return `${m}m ${s}s`;
}

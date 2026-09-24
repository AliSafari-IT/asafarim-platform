import { formatMicros, type CostBasis } from "@asafarim/ai-cost-ledger";

/**
 * Display rules for AI provider cost in TasksAI (issue #591). The same
 * semantics as ResuMatch and Vionto: unknown is "Not tracked" (never
 * $0.00), a fixture call is a genuine $0.00 with its reason, and every
 * state is carried by text, not colour. Copy says **AI provider cost** —
 * never a charge, an invoice or a plan allowance.
 */

export const KIND_LABELS: Record<string, string> = {
  extract_plan: "Plan from notes",
  decompose: "Break down",
  acceptance_criteria: "Acceptance criteria",
  summarize: "Summary",
  nl_query: "Ask the workspace",
};

export function kindLabel(kind: string): string {
  return KIND_LABELS[kind] ?? kind.replace(/_/g, " ");
}

export function amountText(amountMicros: string | null, basis: CostBasis): { text: string; aria: string; unknown: boolean } {
  if (amountMicros === null || basis === "unknown") {
    return { text: "Not tracked", aria: "Cost not tracked for this run", unknown: true };
  }
  const text = formatMicros(BigInt(amountMicros));
  const kind = basis === "actual" ? "provider-reported" : basis === "fixture" ? "offline fixture, no provider called" : "estimated";
  return { text, aria: `${text}, ${kind} AI provider cost`, unknown: false };
}

export function statusBadges(item: { basis: CostBasis; legacy: boolean; credentialSource: string; outcome: string }): string[] {
  const out: string[] = [];
  if (item.legacy) out.push("Legacy");
  out.push(
    item.basis === "actual"
      ? "Actual"
      : item.basis === "fixture"
        ? "Free (fixture)"
        : item.basis === "unknown"
          ? "Not tracked"
          : "Estimated",
  );
  if (item.credentialSource === "user_byok") out.push("BYOK");
  if (item.outcome === "failed") out.push("Failed (still billed)");
  if (item.outcome === "cancelled") out.push("Cancelled");
  if (item.outcome === "degraded") out.push("Fallback");
  return out;
}

export function attributionLabel(attribution: string): string {
  switch (attribution) {
    case "task":
      return "Direct task run";
    case "project":
      return "Shared project run";
    case "workspace":
      return "Workspace run";
    default:
      return "Earlier usage";
  }
}

export function usageText(usage: { bucket: string; unit: string; quantity: number }[]): string {
  const fmt = new Intl.NumberFormat("en-US");
  const sum = (buckets: string[]) => usage.filter((u) => buckets.includes(u.bucket)).reduce((n, u) => n + u.quantity, 0);
  const input = sum(["input", "cached_input", "cache_write_input"]);
  const cached = sum(["cached_input"]);
  const output = sum(["output", "reasoning_output"]);
  if (!input && !output) return "No usage reported";
  return `${fmt.format(input)} in${cached ? ` (${fmt.format(cached)} cached)` : ""} · ${fmt.format(output)} out`;
}

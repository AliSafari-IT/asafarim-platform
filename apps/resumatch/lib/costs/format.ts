import { formatMicros, type CostBasis } from "@asafarim/ai-cost-ledger";

/**
 * Presentation rules for AI cost figures, shared by every surface that
 * shows one. Kept framework-free so the rules themselves are unit-tested:
 * the copy is part of the product's honesty guarantee (#587), not styling.
 */

export const OPERATION_LABELS: Record<string, string> = {
  extract: "CV extraction",
  fetch_job: "Job page fetch",
  job_meta: "Job title & employer",
  tailor: "Resume tailoring",
  cover_letter: "Cover letter",
  rewrite: "Summary rewrite",
  categorize_skills: "Skill categorization",
};

export function operationLabel(operation: string): string {
  return OPERATION_LABELS[operation] ?? operation.replace(/_/g, " ");
}

export interface AmountDisplay {
  text: string;
  /** Screen-reader phrasing — never just a bare number. */
  label: string;
  tone: "known" | "free" | "unknown";
}

/**
 * An amount as shown to a person. `null` is **"Not tracked"** — never
 * `$0.00`, which would claim the call was free. A genuine zero from a
 * fixture (offline, no provider) is `$0.00` *with* its reason.
 */
export function amountDisplay(amountMicros: string | null, basis: CostBasis, locale?: string): AmountDisplay {
  if (amountMicros === null || basis === "unknown") {
    return { text: "Not tracked", label: "Cost not tracked for this call", tone: "unknown" };
  }
  const text = formatMicros(BigInt(amountMicros), { locale });
  if (basis === "fixture") {
    return { text, label: `${text} — offline fixture, no AI provider was called`, tone: "free" };
  }
  const qualifier = basis === "actual" ? "provider-reported" : basis === "adjustment" ? "adjustment" : "estimated";
  return { text, label: `${text}, ${qualifier} AI provider cost`, tone: "known" };
}

export interface StatusBadge {
  text: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  title: string;
}

export function basisBadge(basis: CostBasis, legacy: boolean): StatusBadge {
  if (legacy) {
    return {
      text: "Legacy",
      tone: "neutral",
      title: "Recorded before per-job tracking existed — an estimate that isn't linked to a job.",
    };
  }
  switch (basis) {
    case "actual":
      return { text: "Actual", tone: "success", title: "Amount reported by the AI provider." };
    case "estimated":
      return { text: "Estimated", tone: "info", title: "Estimated from the provider's published price at the time of the call." };
    case "fixture":
      return { text: "Free (fixture)", tone: "neutral", title: "Offline test fixture — no AI provider was called." };
    case "adjustment":
      return { text: "Adjustment", tone: "info", title: "A later correction from the provider's own report." };
    case "unknown":
      return { text: "Not tracked", tone: "warning", title: "Usage happened but its cost couldn't be determined." };
  }
}

export function payerLabel(credentialSource: string): string {
  switch (credentialSource) {
    case "user_byok":
      return "Your API key";
    case "platform":
      return "ResuMatch's key";
    default:
      return "No provider";
  }
}

const numberFormat = (locale?: string) => new Intl.NumberFormat(locale ?? "en-US");

/** "3,100 in · 900 out · 2 web searches" — exclusive buckets, summed per side. */
export function usageSummary(usage: { bucket: string; unit: string; quantity: number }[], locale?: string): string {
  const fmt = numberFormat(locale);
  const tokensIn = usage
    .filter((u) => u.unit === "tokens" && ["input", "cached_input", "cache_write_input", "audio_input", "image_input"].includes(u.bucket))
    .reduce((n, u) => n + u.quantity, 0);
  const cached = usage.filter((u) => u.bucket === "cached_input").reduce((n, u) => n + u.quantity, 0);
  const tokensOut = usage
    .filter((u) => u.unit === "tokens" && ["output", "reasoning_output", "audio_output", "image_output"].includes(u.bucket))
    .reduce((n, u) => n + u.quantity, 0);
  const reasoning = usage.filter((u) => u.bucket === "reasoning_output").reduce((n, u) => n + u.quantity, 0);
  const tools = usage.filter((u) => u.bucket === "tool_call").reduce((n, u) => n + u.quantity, 0);

  const parts: string[] = [];
  if (tokensIn > 0) parts.push(`${fmt.format(tokensIn)} in${cached > 0 ? ` (${fmt.format(cached)} cached)` : ""}`);
  if (tokensOut > 0) parts.push(`${fmt.format(tokensOut)} out${reasoning > 0 ? ` (${fmt.format(reasoning)} reasoning)` : ""}`);
  if (tools > 0) parts.push(`${fmt.format(tools)} web search${tools === 1 ? "" : "es"}`);
  return parts.length ? parts.join(" · ") : "No usage reported";
}

/** Coverage in whole percent, or null for "no data" (never shown as 100%). */
export function coveragePercent(basisPoints: number | null): number | null {
  return basisPoints === null ? null : Math.floor(basisPoints / 100);
}

import { formatMicros, type CostBasis, type CostGroupDTO } from "@asafarim/ai-cost-ledger";

/**
 * Presentation rules for AI cost figures, shared by every surface that
 * shows one. Kept framework-free so the rules themselves are unit-tested:
 * the copy is part of the product's honesty guarantee (#587), not styling.
 *
 * Every helper takes the caller's translate function (`t` from
 * useTranslation() or getTranslator()); the wording lives in
 * lib/i18n/tracking.ts, and the tests run these against the real English
 * dictionary.
 */

/** A translate function — `t` from useTranslation() or getTranslator(). */
export type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** Steps with their own label (resumatch.cost.op.<operation>). */
const KNOWN_OPERATIONS = new Set(["extract", "fetch_job", "job_meta", "tailor", "cover_letter", "rewrite", "categorize_skills"]);

export function operationLabel(operation: string, t: Translate): string {
  return KNOWN_OPERATIONS.has(operation) ? t(`resumatch.cost.op.${operation}`) : operation.replace(/_/g, " ");
}

/** A non-success outcome as shown beside the step, or the raw value for an
 *  outcome this UI doesn't know yet. */
export function outcomeLabel(outcome: string, t: Translate): string {
  return ["failed", "degraded", "cancelled"].includes(outcome) ? t(`resumatch.cost.outcome.${outcome}`) : outcome;
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
export function amountDisplay(amountMicros: string | null, basis: CostBasis, t: Translate, locale?: string): AmountDisplay {
  if (amountMicros === null || basis === "unknown") {
    return {
      text: t("resumatch.cost.amount.notTracked"),
      label: t("resumatch.cost.amount.notTrackedLabel"),
      tone: "unknown",
    };
  }
  const text = formatMicros(BigInt(amountMicros), { locale });
  if (basis === "fixture") {
    return { text, label: t("resumatch.cost.amount.fixtureLabel", { amount: text }), tone: "free" };
  }
  const kind = basis === "actual" ? "actual" : basis === "adjustment" ? "adjustment" : "estimated";
  return { text, label: t(`resumatch.cost.amount.${kind}Label`, { amount: text }), tone: "known" };
}

export interface StatusBadge {
  text: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  title: string;
}

const BASIS_TONE: Record<CostBasis, StatusBadge["tone"]> = {
  actual: "success",
  estimated: "info",
  fixture: "neutral",
  adjustment: "info",
  unknown: "warning",
};

export function basisBadge(basis: CostBasis, legacy: boolean, t: Translate): StatusBadge {
  const key = legacy ? "legacy" : basis;
  return {
    text: t(`resumatch.cost.basis.${key}`),
    tone: legacy ? "neutral" : BASIS_TONE[basis],
    title: t(`resumatch.cost.basis.${key}Title`),
  };
}

export function payerLabel(credentialSource: string, t: Translate): string {
  switch (credentialSource) {
    case "user_byok":
      return t("resumatch.cost.payer.byok");
    case "platform":
      return t("resumatch.cost.payer.platform");
    default:
      return t("resumatch.cost.payer.none");
  }
}

const numberFormat = (locale?: string) => new Intl.NumberFormat(locale ?? "en-US");

/** "3,100 in · 900 out · 2 web searches" — exclusive buckets, summed per side. */
export function usageSummary(
  usage: { bucket: string; unit: string; quantity: number }[],
  t: Translate,
  locale?: string,
): string {
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
  if (tokensIn > 0) {
    parts.push(
      cached > 0
        ? t("resumatch.cost.usage.inCached", { count: fmt.format(tokensIn), cached: fmt.format(cached) })
        : t("resumatch.cost.usage.in", { count: fmt.format(tokensIn) }),
    );
  }
  if (tokensOut > 0) {
    parts.push(
      reasoning > 0
        ? t("resumatch.cost.usage.outReasoning", { count: fmt.format(tokensOut), reasoning: fmt.format(reasoning) })
        : t("resumatch.cost.usage.out", { count: fmt.format(tokensOut) }),
    );
  }
  if (tools > 0) parts.push(t(`resumatch.cost.usage.search.${tools === 1 ? "one" : "other"}`, { count: fmt.format(tools) }));
  return parts.length ? parts.join(" · ") : t("resumatch.cost.usage.none");
}

/** Coverage in whole percent, or null for "no data" (never shown as 100%). */
export function coveragePercent(basisPoints: number | null): number | null {
  return basisPoints === null ? null : Math.floor(basisPoints / 100);
}

/** The label lib/costs/read.ts gives a job group whose job has no title and
 *  no employer — part of the /api/ai-usage response, so it stays English
 *  there; `groupLabel` swaps it for the UI language. */
export const UNTITLED_JOB_LABEL = "Untitled job";

/**
 * A group's heading in the UI language. /api/ai-usage returns English
 * labels (its JSON contract); the job title itself is the candidate's own
 * data and is shown as-is.
 */
export function groupLabel(group: Pick<CostGroupDTO, "kind" | "label"> & { deleted?: boolean }, t: Translate): string {
  if (group.kind === "legacy") return t("resumatch.cost.group.legacy");
  if (group.kind === "profile") return t("resumatch.cost.group.profile");
  if (group.deleted) return t("resumatch.cost.group.deleted");
  if (group.label === UNTITLED_JOB_LABEL) return t("resumatch.untitledJob");
  return group.label;
}

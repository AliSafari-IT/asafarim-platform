/**
 * Audience/intent presets and factual-anchor preservation for the
 * narrative copilot (TLAI-005). This never decides *what* to write — that
 * lives in a provider — it defines the vocabulary a provider's output must
 * conform to, and a heuristic check that a stylistic rewrite didn't quietly
 * drop or change a fact the original text asserted.
 */

export const NARRATIVE_AUDIENCE_PRESETS = [
  "executive_update",
  "product_history",
  "lesson",
  "portfolio_story",
  "memorial",
  "launch_narrative",
] as const;
export type NarrativeAudiencePreset = (typeof NARRATIVE_AUDIENCE_PRESETS)[number];

export const NARRATIVE_ELEMENTS = [
  "hook",
  "act_transition",
  "emphasis",
  "pacing_note",
  "closing_takeaway",
  "field_rewrite",
] as const;
export type NarrativeElement = (typeof NARRATIVE_ELEMENTS)[number];

export const NARRATIVE_VARIANTS = ["concise", "standard", "immersive"] as const;
export type NarrativeVariant = (typeof NARRATIVE_VARIANTS)[number];

const UNCERTAINTY_MARKERS = [
  "circa",
  "approximately",
  "roughly",
  "possibly",
  "probably",
  "reportedly",
  "allegedly",
  "around",
  "about",
  "unclear",
  "unconfirmed",
];

export interface FactualAnchors {
  years: string[];
  urls: string[];
  uncertaintyMarkers: string[];
}

/** Extracts the hard facts a stylistic rewrite must not silently drop: years, URLs, and any hedging language present. */
export function extractFactualAnchors(text: string): FactualAnchors {
  const years = Array.from(new Set(text.match(/\b\d{4}\b/g) ?? []));
  const urls = Array.from(new Set(text.match(/https?:\/\/\S+/g) ?? []));
  const lower = text.toLowerCase();
  const uncertaintyMarkers = UNCERTAINTY_MARKERS.filter((marker) => lower.includes(marker));
  return { years, urls, uncertaintyMarkers };
}

/**
 * Best-effort, not a guarantee: confirms every year and URL from the
 * original text still appears verbatim in the rewrite, and that if the
 * original hedged at all ("circa", "reportedly", ...) the rewrite still
 * hedges somewhere. A tone transform that fails this is flagged with a
 * warning (see lib/server/services/ai-proposals.ts), not silently
 * accepted — it is NOT auto-rejected, since the check can false-positive
 * (e.g. a name that happens to look like a year).
 */
export function preservesFactualAnchors(original: string, rewritten: string): boolean {
  const before = extractFactualAnchors(original);
  const after = extractFactualAnchors(rewritten);

  const allYearsPresent = before.years.every((y) => after.years.includes(y));
  const allUrlsPresent = before.urls.every((u) => rewritten.includes(u));
  const hedgePreserved = before.uncertaintyMarkers.length === 0 || after.uncertaintyMarkers.length > 0;

  return allYearsPresent && allUrlsPresent && hedgePreserved;
}

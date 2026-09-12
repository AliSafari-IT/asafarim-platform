/**
 * Contrast/accessibility checks for the visual director (TLAI-006). Colors
 * are never free text here — both accentColor and background must come
 * from the closed token sets below, which this module has precomputed
 * (WCAG-formula) contrast behavior for. That's what "never generate
 * arbitrary CSS or inaccessible color values" means in practice: there is
 * no code path that accepts a provider-supplied hex string at all.
 */

export interface VisualColorToken {
  id: string;
  hex: string;
}

export const VISUAL_DIRECTOR_BACKGROUNDS: readonly VisualColorToken[] = [
  { id: "paper", hex: "#FAFAF7" },
  { id: "midnight", hex: "#12141C" },
] as const;

// Darker, saturated accents read clearly on the light "paper" background;
// their light counterparts below are for "midnight". Mixing a dark accent
// with the dark background (or a light accent with the light background)
// fails contrast by construction — checkVisualAccessibility computes the
// real ratio rather than trusting this naming, but the naming is why the
// heuristics in visual-director.ts only ever pair them "same suffix as
// background darkness."
export const VISUAL_DIRECTOR_ACCENTS: readonly VisualColorToken[] = [
  { id: "indigo", hex: "#3730A3" },
  { id: "amber", hex: "#B45309" },
  { id: "teal", hex: "#0F766E" },
  { id: "indigo-light", hex: "#A5B4FC" },
  { id: "amber-light", hex: "#FCD34D" },
  { id: "teal-light", hex: "#5EEAD4" },
] as const;

function hexToLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return 0.2126 * hexToLinear(r) + 0.7152 * hexToLinear(g) + 0.0722 * hexToLinear(b);
}

/** WCAG 2.x contrast ratio, 1–21. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexA) + 0.05;
  const lumB = relativeLuminance(hexB) + 0.05;
  return lumA > lumB ? lumA / lumB : lumB / lumA;
}

/** WCAG AA for normal-size text; the bar every accent/background pairing here must clear. */
const MIN_CONTRAST_RATIO = 4.5;

export interface AccessibilityCheckInput {
  backgroundId: string;
  accentId: string;
  layout: string;
  density?: "compact" | "comfortable" | "spacious";
  eventCount: number;
}

export interface AccessibilityViolation {
  code: "insufficient_contrast" | "unknown_color_token" | "density_overflow_risk";
  message: string;
}

/**
 * Every visual-direction candidate must pass this before it can even be
 * proposed (enforced in lib/ai/visual-director.ts, which builds candidates
 * only from token pairs that pass) — a candidate that fails isn't
 * surfaced with a warning, it's dropped, because "every proposal passes
 * automated contrast/accessibility constraints" is a hard acceptance
 * criterion here, unlike the narrative copilot's advisory-only
 * fact-preservation check.
 */
export function checkVisualAccessibility(input: AccessibilityCheckInput): AccessibilityViolation[] {
  const violations: AccessibilityViolation[] = [];

  const background = VISUAL_DIRECTOR_BACKGROUNDS.find((b) => b.id === input.backgroundId);
  const accent = VISUAL_DIRECTOR_ACCENTS.find((a) => a.id === input.accentId);
  if (!background || !accent) {
    violations.push({ code: "unknown_color_token", message: "Color must come from the approved token set." });
    return violations; // nothing further to check without valid tokens
  }

  const ratio = contrastRatio(background.hex, accent.hex);
  if (ratio < MIN_CONTRAST_RATIO) {
    violations.push({
      code: "insufficient_contrast",
      message: `Accent "${accent.id}" on background "${background.id}" has a ${ratio.toFixed(2)}:1 contrast ratio, below the ${MIN_CONTRAST_RATIO}:1 minimum.`,
    });
  }

  // No font-size token exists yet in the theme vocabulary (lib/schemas.ts#ThemeSettingsSchema)
  // to check a real minimum type size against — "compact" density packing
  // many events is the closest available proxy for readability risk, so
  // that combination is flagged rather than silently allowed.
  if (input.density === "compact" && input.eventCount > 100) {
    violations.push({
      code: "density_overflow_risk",
      message: "Compact density with this many events risks unreadable, overlapping content.",
    });
  }

  return violations;
}

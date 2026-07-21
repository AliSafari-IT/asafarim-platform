import type { BrandingType } from "@asafarim/appbuilder-schema";
import { sanitizeUrl } from "./url";

/**
 * The only accent choices a generated app's branding may resolve to — never
 * an arbitrary hex/CSS value passed straight to a style attribute. Mapped to
 * `@asafarim/ui`'s existing token language so a generated app's chrome stays
 * within the platform's accessible-contrast, light/dark-aware palette.
 */
export const SAFE_ACCENT_CHOICES = [
  "violet",
  "teal",
  "amber",
  "emerald",
  "sky",
  "rose",
] as const;
export type SafeAccent = (typeof SAFE_ACCENT_CHOICES)[number];

const ACCENT_HEX: Record<SafeAccent, string> = {
  violet: "#7c3aed",
  teal: "#0f766e",
  amber: "#b45309",
  emerald: "#10b981",
  sky: "#0891b2",
  rose: "#be123c",
};

/** Constrained radius/density presets — never an arbitrary CSS length. */
export const SAFE_RADIUS_CHOICES = ["sharp", "soft", "pill"] as const;
export type SafeRadius = (typeof SAFE_RADIUS_CHOICES)[number];

export interface ResolvedBranding {
  productName: string;
  logoUrl: string | null;
  accent: SafeAccent;
  accentHex: string;
  theme: "light" | "dark" | "system";
  radius: SafeRadius;
}

/**
 * Maps a specification's free-form `branding.primaryColor` onto the nearest
 * safe accent choice, defaulting to "violet" (the AppBuilder factory mood)
 * for anything that isn't already one of the safe hex values. This is the
 * whole allowlist boundary: a specification can never inject an arbitrary
 * color, class name, or style string into the rendered chrome.
 */
export function resolveBranding(branding: BrandingType, appName: string): ResolvedBranding {
  const accent = accentFromHex(branding.primaryColor) ?? "violet";
  return {
    productName: (branding.companyName ?? appName).slice(0, 200),
    logoUrl: sanitizeUrl(branding.logoUrl, "image"),
    accent,
    accentHex: ACCENT_HEX[accent],
    theme: branding.theme,
    radius: "soft",
  };
}

function accentFromHex(hex: string | undefined): SafeAccent | null {
  if (!hex) return null;
  const normalized = hex.toLowerCase();
  const entry = (Object.entries(ACCENT_HEX) as [SafeAccent, string][]).find(
    ([, value]) => value === normalized,
  );
  return entry ? entry[0] : null;
}

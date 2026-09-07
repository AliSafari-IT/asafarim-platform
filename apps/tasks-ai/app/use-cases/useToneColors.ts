"use client";

import { useEffect, useState } from "react";

const TOKENS = {
  // --muted rather than --line-strong: several themes declare the latter at
  // ~22% alpha, which is too faint for a connector line to read.
  default: "--muted",
  ok: "--accent",
  muted: "--line-strong",
  warn: "--accent-2",
} as const;

export type Tone = keyof typeof TOKENS;
export type ToneColors = Record<Tone, string>;

const FALLBACK: ToneColors = {
  default: "#9aa0a6",
  ok: "#1f6feb",
  muted: "#9aa0a6",
  warn: "#8a6d00",
};

const hex2 = (n: number) => Math.round(n).toString(16).padStart(2, "0");

/**
 * Normalises a token value to a `#rrggbb[aa]` string.
 *
 * Several themes declare tokens as `rgba(18, 32, 29, 0.22)`. React Flow
 * derives SVG marker ids from the marker props, so parentheses, commas and
 * spaces would produce an invalid `url(#...)` reference — and an element
 * with a broken marker reference is not rendered at all.
 */
function toHex(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (v.startsWith("#")) return v;

  const nums = v.match(/-?[\d.]+/g);
  if (!nums || nums.length < 3) return null;

  const [r, g, b] = nums.slice(0, 3).map(Number);
  const a = nums.length > 3 ? Number(nums[3]) : 1;
  const alpha = a >= 1 ? "" : hex2(a * 255);
  return `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha}`;
}

function read(): ToneColors {
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const [tone, token] of Object.entries(TOKENS) as [Tone, string][]) {
    const hex = toHex(cs.getPropertyValue(token));
    if (hex) out[tone] = hex;
  }
  return out;
}

/**
 * Resolves design tokens to concrete colour strings.
 *
 * React Flow builds SVG marker ids from the marker props, so passing a raw
 * `var(--accent)` produces an invalid `url(#...)` reference and the edge path
 * silently fails to render. Tokens stay the source of truth; we just hand
 * React Flow the computed value, and re-read it when the theme flips.
 */
export function useToneColors(): ToneColors {
  const [colors, setColors] = useState<ToneColors>(FALLBACK);

  useEffect(() => {
    setColors(read());

    const html = document.documentElement;
    const observer = new MutationObserver(() => setColors(read()));
    observer.observe(html, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  return colors;
}

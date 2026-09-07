"use client";

import { useEffect, useState } from "react";

const TOKENS = {
  default: "--line-strong",
  ok: "--accent",
  muted: "--muted",
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

function read(): ToneColors {
  const cs = getComputedStyle(document.documentElement);
  const out = { ...FALLBACK };
  for (const [tone, token] of Object.entries(TOKENS) as [Tone, string][]) {
    const v = cs.getPropertyValue(token).trim();
    if (v) out[tone] = v;
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

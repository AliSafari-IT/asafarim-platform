/**
 * Safe URL policy for anything a specification/branding/component config
 * supplies (logo/image references, link hrefs). Only these protocols are
 * ever allowed through to a real `href`/`src` — everything else (including
 * `javascript:`, `data:text/html`, `vbscript:`, `file:`) is rejected. Plain
 * relative paths (no scheme) are allowed since they can only ever resolve
 * within this app's own origin.
 */
const SAFE_PROTOCOLS = new Set(["https:", "http:"]);

/** Image/logo references may additionally use safe, inert `data:` image types — never `data:text/html`. */
const SAFE_DATA_IMAGE_TYPES = new Set([
  "data:image/png",
  "data:image/jpeg",
  "data:image/gif",
  "data:image/webp",
  "data:image/svg+xml",
]);

export type UrlKind = "link" | "image";

/**
 * Returns the URL if safe to render, or `null` if it must be rejected. Never
 * throws — callers render the empty/placeholder state on `null` rather than
 * letting an unsafe value reach the DOM.
 */
export function sanitizeUrl(raw: unknown, kind: UrlKind = "link"): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 2000) return null;
  const trimmed = raw.trim();

  // Relative/same-origin paths (no scheme) are always safe.
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;

  if (kind === "image" && trimmed.toLowerCase().startsWith("data:")) {
    const prefix = trimmed.slice(0, trimmed.indexOf(",") + 1 || trimmed.length).toLowerCase();
    const matchesSafeType = [...SAFE_DATA_IMAGE_TYPES].some((safe) => prefix.startsWith(safe));
    return matchesSafeType ? trimmed : null;
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  return SAFE_PROTOCOLS.has(parsed.protocol) ? parsed.toString() : null;
}

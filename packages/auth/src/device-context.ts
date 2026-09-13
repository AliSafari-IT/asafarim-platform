import { UAParser } from "ua-parser-js";

/** Normalized, reproducible interpretation of a User-Agent string. */
export interface DeviceContext {
  browserFamily: string | null;
  browserVersion: string | null;
  osFamily: string | null;
  osVersion: string | null;
  /** "desktop" | "mobile" | "tablet" | other UAParser device types, when detectable. */
  deviceClass: string | null;
  /** The parser + version that produced this interpretation, so historical rows stay reproducible if the parser changes. */
  parsedWith: string;
}

const PARSER_VERSION = "ua-parser-js";

/**
 * Parses a User-Agent header into normalized fields. Never throws — an
 * unparseable or absent UA returns null rather than fabricating a value, per
 * issue #349's "existing records should display unknown/not recorded rather
 * than inventing values" requirement.
 */
export function parseUserAgent(userAgent: string | null | undefined): DeviceContext | null {
  if (!userAgent) return null;
  try {
    const result = new UAParser(userAgent).getResult();
    const browserFamily = result.browser.name ?? null;
    const osFamily = result.os.name ?? null;
    if (!browserFamily && !osFamily) return null;
    return {
      browserFamily,
      browserVersion: result.browser.version ?? null,
      osFamily,
      osVersion: result.os.version ?? null,
      deviceClass: result.device.type ?? "desktop",
      parsedWith: PARSER_VERSION,
    };
  } catch {
    return null;
  }
}

/** Best-effort client IP from proxy headers (nginx sets x-forwarded-for). */
export function getClientIpFromHeaders(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return headers.get("x-real-ip");
}

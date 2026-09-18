import "server-only";
import { normalizeWhitespace } from "../extraction/text";

/**
 * Single job-URL fetch + extraction for the CV-tailoring flow.
 *
 * ResuMatch does not aggregate job postings — a candidate pastes one URL
 * they intend to apply to, and this module fetches exactly that one page.
 * The SSRF posture below is ported from the old matching product's `lib/ingestion/`
 * (authorization.ts + http.ts): even though there is no source registry or
 * agreement to check anymore, an outbound request built from user-supplied
 * input is still a server-side request forgery vector, so the same
 * public-HTTPS-only / no-redirect / size-capped / timeout-bounded posture
 * applies here as directly as it did to a connector endpoint.
 */

export const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
export const REQUEST_TIMEOUT_MS = 15_000;
export const USER_AGENT = "ResuMatch/1.0 (+https://resumatch.asafarim.com)";

/**
 * Hosts that must never be fetched, whatever a candidate pastes (mirrors
 * the old product's JM-030 rule). A pasted URL is user-supplied input, which makes
 * it a server-side request forgery vector: point it at the cloud metadata
 * service and the fetch returns credentials on the attacker's behalf.
 */
const BLOCKED_HOSTNAMES = new Set(["localhost", "metadata.google.internal", "metadata.goog"]);

/** Private, loopback, link-local and carrier-grade NAT ranges. */
const BLOCKED_IPV4 =
  /^(0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

export function isPublicHttpsUrl(candidate: string): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }

  // HTTPS only. A page fetched over plaintext can be rewritten in transit,
  // and its content is fed to an AI prompt.
  if (url.protocol !== "https:") return false;

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTNAMES.has(hostname)) return false;
  if (hostname.endsWith(".localhost") || hostname.endsWith(".internal")) return false;

  // IPv6 loopback and unique-local.
  if (hostname === "::1" || hostname.startsWith("fc") || hostname.startsWith("fd")) return false;

  if (BLOCKED_IPV4.test(hostname)) return false;

  // A bare hostname with no dot is an internal name on most networks.
  if (!hostname.includes(".") && !hostname.includes(":")) return false;

  return true;
}

export type JobFetchResult =
  | {
      ok: true;
      rawText: string;
      title: string | null;
      employer: string | null;
    }
  | { ok: false; reasonCode: JobFetchRefusal };

export type JobFetchRefusal =
  | "URL_NOT_ALLOWED"
  | "REDIRECT_REFUSED"
  | "RESPONSE_TOO_LARGE"
  | "TIMEOUT"
  | "HTTP_ERROR"
  | "NETWORK_ERROR"
  | "NO_READABLE_TEXT";

export async function fetchJobPosting(
  url: string,
  fetchImpl: typeof fetch = fetch,
): Promise<JobFetchResult> {
  if (!isPublicHttpsUrl(url)) return { ok: false, reasonCode: "URL_NOT_ALLOWED" };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let html: string;
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "text/html", "user-agent": USER_AGENT },
      // Not "follow": a redirect from a permitted host to a private address
      // is the standard SSRF bypass, and re-validating each hop is more
      // moving parts than refusing outright.
      redirect: "manual",
      signal: controller.signal,
    });

    if (response.status >= 300 && response.status < 400) {
      return { ok: false, reasonCode: "REDIRECT_REFUSED" };
    }
    if (!response.ok) return { ok: false, reasonCode: "HTTP_ERROR" };

    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
      return { ok: false, reasonCode: "RESPONSE_TOO_LARGE" };
    }

    html = await response.text();
    if (html.length > MAX_RESPONSE_BYTES) {
      return { ok: false, reasonCode: "RESPONSE_TOO_LARGE" };
    }
  } catch (error) {
    // The error itself is never surfaced or logged: fetch errors can embed
    // the full URL, and a pasted job URL is candidate-supplied data.
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, reasonCode: "TIMEOUT" };
    }
    return { ok: false, reasonCode: "NETWORK_ERROR" };
  } finally {
    clearTimeout(timer);
  }

  const rawText = extractReadableText(html);
  if (rawText.length < MIN_USEFUL_CHARACTERS) {
    return { ok: false, reasonCode: "NO_READABLE_TEXT" };
  }

  return {
    ok: true,
    rawText,
    title: extractTitle(html),
    employer: extractEmployer(html),
  };
}

/** Below this, "extraction succeeded" is almost certainly an empty shell page. */
const MIN_USEFUL_CHARACTERS = 120;

/** Guards against a decompression-bomb-shaped page producing megabytes of text. */
const MAX_EXTRACTED_CHARACTERS = 200_000;

/**
 * Strips markup down to readable text. Deliberately regex-based rather than
 * a DOM/HTML-parsing dependency: a job posting page is read once per
 * candidate action, not parsed structurally, so a full parser is more
 * machinery than this one-shot extraction needs.
 */
export function extractReadableText(html: string): string {
  const withoutNoise = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");

  return normalizeWhitespace(withoutNoise).slice(0, MAX_EXTRACTED_CHARACTERS);
}

function extractTitle(html: string): string | null {
  const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (ogTitle) return decodeEntities(ogTitle[1]).trim().slice(0, 300) || null;

  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleTag) return decodeEntities(titleTag[1]).trim().slice(0, 300) || null;

  return null;
}

function extractEmployer(html: string): string | null {
  const ogSite = html.match(
    /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i,
  );
  if (ogSite) return decodeEntities(ogSite[1]).trim().slice(0, 200) || null;

  return null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

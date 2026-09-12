import "server-only";
import { isSafeExternalUrl } from "../../schemas";
import { UnsupportedSourceError } from "../../ai/source-import";

/**
 * Fetches a URL for source import through the same SSRF-safe allowlist
 * already used for event image/link URLs (lib/schemas.ts#isSafeExternalUrl)
 * - https-only, no localhost/private/link-local hosts. Strips HTML down to
 * plain text before it's handed to normalizeSourceDocument; only
 * text/html and text/plain responses are accepted.
 */

const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 1_000_000; // 1MB - well above what any text extraction needs

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const MAX_REDIRECTS = 3;

/**
 * Follows redirects manually (rather than `redirect: "follow"`) so every
 * hop - not just the original URL - is checked against isSafeExternalUrl.
 * A same-origin-looking URL could otherwise 302 to a private/internal
 * address and the fetch would happily follow it.
 */
async function fetchFollowingSafeRedirects(startUrl: string, signal: AbortSignal): Promise<Response> {
  let currentUrl = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isSafeExternalUrl(currentUrl)) {
      throw new UnsupportedSourceError("That link isn't allowed - please use a public https:// address.");
    }

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        signal,
        redirect: "manual",
        headers: { Accept: "text/html,text/plain" },
      });
    } catch {
      throw new UnsupportedSourceError("Couldn't fetch that link. Please check the URL and try again.");
    }

    const isRedirect = response.status >= 300 && response.status < 400;
    const location = response.headers.get("location");
    if (!isRedirect || !location) return response;

    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new UnsupportedSourceError("That link redirected too many times.");
}

export async function fetchUrlSource(url: string): Promise<string> {
  if (!isSafeExternalUrl(url)) {
    throw new UnsupportedSourceError("That link isn't allowed - please use a public https:// address.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetchFollowingSafeRedirects(url, controller.signal);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new UnsupportedSourceError(`That link returned an error (${response.status}).`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
    throw new UnsupportedSourceError("That link doesn't point to a text or HTML page.");
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_RESPONSE_BYTES) {
    throw new UnsupportedSourceError("That page is too large to import.");
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > MAX_RESPONSE_BYTES) {
    throw new UnsupportedSourceError("That page is too large to import.");
  }

  const raw = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  return contentType.includes("text/html") ? stripHtml(raw) : raw;
}

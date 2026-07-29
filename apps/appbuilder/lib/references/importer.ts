import { createHash } from "node:crypto";
import { ReferenceNoContentError } from "./errors";
import { extractReferenceContent } from "./extract";
import { fetchBoundedReference, type ReferenceFetchDeps } from "./fetchReference";
import { importGitHubReference } from "./github";
import { REFERENCE_ADAPTER_VERSIONS, REFERENCE_LIMITS, type ReferenceAdapter, type ReferenceFact } from "./limits";
import { normalizeReferenceUrl } from "./urlPolicy";

/**
 * M13 slice F — adapter selection and the pure (database-free) import
 * result. Kept separate from lib/repositories/references.ts so the network
 * behavior can be tested exhaustively (redirects, rebinding, oversize
 * bodies, unsupported types, rate limits, injection payloads) without a
 * database, and so the repository layer only deals with caching, quotas,
 * authorization, and provenance persistence.
 *
 * Adapter order matters: a github.com profile/repository URL is handled by
 * the GitHub adapter (bounded structured facts from the public API) rather
 * than by scraping the HTML page, which would produce hundreds of navigation
 * links and no reliable metadata. Everything else — including github.com
 * URLs the adapter deliberately does not claim, like a pull request or a
 * file — falls through to the generic HTTPS adapter.
 */

export interface ReferenceImportPayload {
  /** The normalized URL that was requested, and the cache key. */
  sourceUrl: string;
  /** Where the fetch ended up (differs from `sourceUrl` after redirects, or when an adapter used an API endpoint). */
  finalUrl: string;
  host: string;
  adapter: ReferenceAdapter;
  adapterVersion: string;
  title: string | null;
  contentType: string | null;
  text: string;
  facts: ReferenceFact[];
  contentHash: string;
  /** Characters extracted before the per-reference bound was applied. */
  originalChars: number;
  truncated: boolean;
  fetchedAt: Date;
  rateLimit: { remaining: number | null; resetAtSeconds: number | null };
}

export function hashReferenceContent(text: string, facts: readonly ReferenceFact[]): string {
  return createHash("sha256")
    .update(JSON.stringify({ text, facts }))
    .digest("hex");
}

/**
 * Fetches and extracts one public HTTPS reference. Throws a `Reference*Error`
 * for every failure mode (URL policy, redirects, timeout, size, content
 * type, upstream status, rate limit, empty content) — the caller decides
 * whether that becomes a 4xx or a stale-labelled cached row.
 */
export async function importReferencePayload(
  rawUrl: string,
  deps: ReferenceFetchDeps = {},
  now: Date = new Date(),
): Promise<ReferenceImportPayload> {
  const url = normalizeReferenceUrl(rawUrl);

  const github = await importGitHubReference(url, deps);
  if (github) {
    if (github.text.trim().length === 0 && github.facts.length === 0) throw new ReferenceNoContentError();
    return {
      sourceUrl: url.toString(),
      finalUrl: github.finalUrl,
      host: url.hostname,
      adapter: github.adapter,
      adapterVersion: github.adapterVersion,
      title: github.title,
      contentType: "application/json",
      text: github.text,
      facts: github.facts,
      contentHash: hashReferenceContent(github.text, github.facts),
      originalChars: github.text.length,
      truncated: false,
      fetchedAt: now,
      rateLimit: github.rateLimit,
    };
  }

  const response = await fetchBoundedReference(url.toString(), {}, deps);
  const { extraction, title, description } = extractReferenceContent(
    response.body,
    response.contentType,
    REFERENCE_LIMITS.MAX_EXTRACTED_TEXT_CHARS,
  );

  if (extraction.text.trim().length === 0) throw new ReferenceNoContentError();

  const facts: ReferenceFact[] = [];
  if (title) facts.push({ label: "page title", value: title });
  if (description) facts.push({ label: "page description", value: description });

  return {
    sourceUrl: url.toString(),
    finalUrl: response.finalUrl,
    host: new URL(response.finalUrl).hostname,
    adapter: "generic_https",
    adapterVersion: REFERENCE_ADAPTER_VERSIONS.generic_https,
    title,
    contentType: response.contentType,
    text: extraction.text,
    facts,
    contentHash: hashReferenceContent(extraction.text, facts),
    originalChars: extraction.originalChars,
    truncated: extraction.truncated,
    fetchedAt: now,
    rateLimit: response.rateLimit,
  };
}

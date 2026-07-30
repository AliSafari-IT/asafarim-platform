/**
 * M13 slice F — the server-owned catalogue for importing public HTTPS
 * references (docs/appbuilder-m13-multimodal-contextual-assistant.md, slice
 * F). Same contract as the attachment catalogue in lib/attachments/limits.ts:
 * these are the only numbers that matter, they are served to the client
 * through `referencePolicy()`, and every one of them is re-enforced
 * server-side at import time regardless of what the client checked.
 *
 * Every ceiling here is small on purpose. A reference import is an
 * *unauthenticated outbound request to a host the user named*, so the blast
 * radius of each individual bound (time held open, bytes buffered, hops
 * followed, rows kept) is the thing being limited — not the user's
 * convenience.
 */

/** Which adapter handled an import. Persisted on the row and reported as provenance. */
export type ReferenceAdapter = "generic_https" | "github_profile" | "github_repository";

/**
 * One labelled fact an adapter extracted from a reference. Every value is
 * remote, third-party-authored text (a GitHub bio, a repository
 * description), so facts are wrapped as untrusted prompt data exactly like a
 * fetched page body — being structured does not make them trusted.
 */
export interface ReferenceFact {
  label: string;
  value: string;
}

/**
 * Bumped whenever an adapter's extraction or fact selection changes in a way
 * that would alter what a re-fetch of the same URL produces. Stored per row
 * so a cached reference can be identified as having been produced by older
 * logic (M13 requires provenance to carry "adapter/version").
 */
export const REFERENCE_ADAPTER_VERSIONS: Record<ReferenceAdapter, string> = {
  generic_https: "m13-slice-f-v1",
  github_profile: "m13-slice-f-v1",
  github_repository: "m13-slice-f-v1",
};

/**
 * Content types an import may return. HTML/plain/markdown/JSON only —
 * everything else (images, PDFs, archives, octet-stream, JavaScript) is
 * rejected at the response boundary rather than downloaded and inspected.
 * An attachment upload is the supported path for binary content; it has
 * sniffing, scanning, and quarantine that a URL fetch deliberately does not.
 */
export const ALLOWED_REFERENCE_CONTENT_TYPES: readonly string[] = [
  "text/html",
  "application/xhtml+xml",
  "text/plain",
  "text/markdown",
  "application/json",
];

export const REFERENCE_LIMITS = {
  /** Hard ceiling on the response body actually read, enforced while streaming (not just from Content-Length, which a host may lie about or omit). */
  MAX_RESPONSE_BYTES: 512 * 1024,
  /** Whole-request budget, including every redirect hop. */
  TIMEOUT_MS: 8_000,
  /**
   * Redirect hops followed. Every hop is re-validated from scratch (scheme,
   * host shape, and resolved addresses) — a redirect is the classic way to
   * turn an allowed public URL into a request at an internal address, so
   * "followed" never means "trusted".
   */
  MAX_REDIRECTS: 3,
  /** Extracted text stored per reference. */
  MAX_EXTRACTED_TEXT_CHARS: 20_000,
  /** Structured facts stored per reference. */
  MAX_FACTS: 24,
  MAX_FACT_VALUE_CHARS: 300,
  MAX_TITLE_CHARS: 200,
  MAX_URL_LENGTH: 2_000,
  /** Repositories an imported GitHub profile contributes. Bounded selection, not "every repo they have". */
  MAX_GITHUB_REPOSITORIES: 6,
  MAX_GITHUB_TOPICS: 8,
  /** How long a fetched reference may be reused without re-fetching. */
  CACHE_TTL_SECONDS: 60 * 60 * 6,
  /** References the context assembler may include in one prompt. */
  MAX_CONTEXT_REFERENCES: 4,
  MAX_CONTEXT_TEXT_CHARS_PER_REFERENCE: 8_000,
  MAX_CONTEXT_TEXT_CHARS_TOTAL: 20_000,
} as const;

/** The wire shape of the catalogue, as served to the composer. */
export interface ReferencePolicy {
  /** Only `https` is ever importable — stated explicitly so the client can say why, not just refuse. */
  allowedSchemes: readonly string[];
  allowedContentTypes: readonly string[];
  maxResponseBytes: number;
  maxRedirects: number;
  timeoutMs: number;
  cacheTtlSeconds: number;
  maxUrlLength: number;
  /** Adapters and their versions, so the UI can label provenance without hardcoding names. */
  adapters: { adapter: ReferenceAdapter; version: string }[];
}

export function referencePolicy(): ReferencePolicy {
  return {
    allowedSchemes: ["https"],
    allowedContentTypes: ALLOWED_REFERENCE_CONTENT_TYPES,
    maxResponseBytes: REFERENCE_LIMITS.MAX_RESPONSE_BYTES,
    maxRedirects: REFERENCE_LIMITS.MAX_REDIRECTS,
    timeoutMs: REFERENCE_LIMITS.TIMEOUT_MS,
    cacheTtlSeconds: REFERENCE_LIMITS.CACHE_TTL_SECONDS,
    maxUrlLength: REFERENCE_LIMITS.MAX_URL_LENGTH,
    adapters: (Object.keys(REFERENCE_ADAPTER_VERSIONS) as ReferenceAdapter[]).map((adapter) => ({
      adapter,
      version: REFERENCE_ADAPTER_VERSIONS[adapter],
    })),
  };
}

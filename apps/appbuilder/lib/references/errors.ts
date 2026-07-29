import { ConflictError } from "../errors";

/**
 * M13 slice F reference-import failures. All of them are `ConflictError`
 * subclasses (mapped to specific codes/statuses in lib/http/errors.ts),
 * because none of them are server faults: each one means "the URL you asked
 * for cannot be imported", which the user can act on.
 *
 * Every message here is safe to show a user AND safe to persist on the row.
 * They deliberately never carry the resolved IP address, the DNS answer, the
 * remote response body, or the redirect chain: telling a caller *which*
 * internal address their URL resolved to turns a blocked SSRF attempt into a
 * working internal port scanner. `failureCode` is what operators correlate
 * on; the detail stays in the operational event, not the API response.
 */
export type ReferenceFailureCode =
  | "url_not_allowed"
  | "too_many_redirects"
  | "timeout"
  | "too_large"
  | "unsupported_content_type"
  | "fetch_failed"
  | "rate_limited"
  | "no_content";

export class ReferenceUrlNotAllowedError extends ConflictError {
  readonly failureCode = "url_not_allowed" as const;
  /** Coarse reason for operators (`private_address`, `non_https`, …) — never included in the user-facing message. */
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.name = "ReferenceUrlNotAllowedError";
    this.reason = reason;
  }
}

export class ReferenceTooManyRedirectsError extends ConflictError {
  readonly failureCode = "too_many_redirects" as const;
  constructor(maxRedirects: number) {
    super(`This URL redirected more than ${maxRedirects} times, so the import was stopped.`);
    this.name = "ReferenceTooManyRedirectsError";
  }
}

export class ReferenceTimeoutError extends ConflictError {
  readonly failureCode = "timeout" as const;
  constructor(timeoutMs: number) {
    super(`That site did not respond within ${Math.round(timeoutMs / 1000)} seconds.`);
    this.name = "ReferenceTimeoutError";
  }
}

export class ReferenceTooLargeError extends ConflictError {
  readonly failureCode = "too_large" as const;
  constructor(maxBytes: number) {
    super(`That page is larger than the ${Math.round(maxBytes / 1024)}KB import limit.`);
    this.name = "ReferenceTooLargeError";
  }
}

export class UnsupportedReferenceContentTypeError extends ConflictError {
  readonly failureCode = "unsupported_content_type" as const;
  constructor(contentType: string | null) {
    super(
      contentType
        ? `"${contentType}" content cannot be imported from a URL. Upload the file as an attachment instead.`
        : "That URL did not say what kind of content it returned, so it was not imported.",
    );
    this.name = "UnsupportedReferenceContentTypeError";
  }
}

/** A transport error or non-2xx response from the remote host. The upstream status is kept for operators but never interpolated into the message. */
export class ReferenceFetchFailedError extends ConflictError {
  readonly failureCode = "fetch_failed" as const;
  readonly status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "ReferenceFetchFailedError";
    this.status = status;
  }
}

/** The remote API refused because ITS rate limit is exhausted (e.g. GitHub's unauthenticated 60/hour). Distinct from our own quota — nothing the user did wrong, and it will recover on its own. */
export class ReferenceRateLimitedError extends ConflictError {
  readonly failureCode = "rate_limited" as const;
  readonly retryAfterSeconds: number | null;

  constructor(host: string, retryAfterSeconds: number | null) {
    super(
      retryAfterSeconds
        ? `${host} is rate-limiting us right now. Try again in about ${Math.max(1, Math.ceil(retryAfterSeconds / 60))} minute(s).`
        : `${host} is rate-limiting us right now. Try again shortly.`,
    );
    this.name = "ReferenceRateLimitedError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** The fetch succeeded but produced nothing usable — an empty page, or a body that extracted to whitespace. */
export class ReferenceNoContentError extends ConflictError {
  readonly failureCode = "no_content" as const;
  constructor() {
    super("Nothing readable could be extracted from that URL.");
    this.name = "ReferenceNoContentError";
  }
}

/** The `failureCode` for any reference error, or `fetch_failed` for anything unrecognized — never leaks an unmapped error's message. */
export function referenceFailureCodeOf(err: unknown): ReferenceFailureCode {
  if (
    err instanceof ReferenceUrlNotAllowedError ||
    err instanceof ReferenceTooManyRedirectsError ||
    err instanceof ReferenceTimeoutError ||
    err instanceof ReferenceTooLargeError ||
    err instanceof UnsupportedReferenceContentTypeError ||
    err instanceof ReferenceFetchFailedError ||
    err instanceof ReferenceRateLimitedError ||
    err instanceof ReferenceNoContentError
  ) {
    return err.failureCode;
  }
  return "fetch_failed";
}

/** The safe, user-facing message for a reference failure — mirrors lib/generation/errors.ts#safeFailureMessage's contract: an unrecognized error never contributes its own text. */
export function safeReferenceFailureMessage(err: unknown): string {
  if (
    err instanceof ReferenceUrlNotAllowedError ||
    err instanceof ReferenceTooManyRedirectsError ||
    err instanceof ReferenceTimeoutError ||
    err instanceof ReferenceTooLargeError ||
    err instanceof UnsupportedReferenceContentTypeError ||
    err instanceof ReferenceFetchFailedError ||
    err instanceof ReferenceRateLimitedError ||
    err instanceof ReferenceNoContentError
  ) {
    return err.message;
  }
  return "That URL could not be imported.";
}

/**
 * Shared base for every AI domain's provider error (issue #515).
 *
 * Each domain (extraction, rewrite, categorize, tailoring, cover letter,
 * job fetch, job meta) keeps its own thin subclass so `instanceof` checks and
 * the `name` stored in call outcomes stay domain-specific. The subclass only
 * sets `name`; message and `retryable` handling live here.
 *
 * `retryable` defaults to `true`: a provider error is assumed transient
 * unless the adapter knows better (bad request, refused content, …).
 */
export class AiProviderError extends Error {
  readonly retryable: boolean;

  constructor(message: string, retryable = true) {
    super(message);
    this.name = "AiProviderError";
    this.retryable = retryable;
  }
}

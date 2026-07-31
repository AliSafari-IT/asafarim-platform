import { randomUUID } from "node:crypto";

/**
 * M13 slice G — end-to-end correlation IDs.
 *
 * The `operational_events.correlation_id` column has existed since M12 but
 * nothing ever populated it, so the events it indexed could only be read one
 * category at a time. One M13 conversational change now spans an HTTP
 * request, a queued job, one or more provider calls, a plan of further jobs,
 * and background attachment/reference work — an operator asking "what
 * happened to this request" needs those joined, not correlated by eyeball
 * across timestamps.
 *
 * The rules below are what make the id safe to accept from a caller at all:
 *
 * - **Format-validated, never echoed raw.** An inbound header is accepted
 *   only if it matches `CORRELATION_ID_PATTERN`; anything else is discarded
 *   and replaced with a fresh id rather than sanitized. This value ends up
 *   in a persisted column and in response headers, so accepting arbitrary
 *   caller text would make it a log-injection and header-splitting vector.
 * - **Never an identifier of anything.** It grants nothing, addresses
 *   nothing, and is never used for authorization, idempotency, or lookup of
 *   another user's rows. Accepting a caller-supplied one is therefore safe
 *   even though the caller could reuse someone else's — the worst outcome is
 *   two unrelated requests sharing a trace label.
 * - **Never derived from user content.** It carries no principal id, app id,
 *   filename, or URL, so it stays safe to log at any level.
 */

/** Inbound/outbound header name. `x-` prefixed to stay clear of the IETF-registered `Correlation-ID` draft. */
export const CORRELATION_ID_HEADER = "x-correlation-id";

/**
 * 8–64 chars of URL-safe id. Deliberately narrow: it admits a UUID, a
 * ULID, and an upstream trace id, and admits nothing with whitespace,
 * newlines, quotes, or control characters.
 */
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export function newCorrelationId(): string {
  return randomUUID();
}

/** A caller-supplied id if it is well-formed, otherwise null. Never throws — a malformed trace label must not fail a real request. */
export function parseCorrelationId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return CORRELATION_ID_PATTERN.test(trimmed) ? trimmed : null;
}

/**
 * The correlation id for one inbound API request: the caller's if it is
 * well-formed, otherwise a fresh one. Every M13 route uses this so a client
 * that already has a trace can join our events to it, and a client that has
 * none still gets a joinable request.
 */
export function correlationIdFrom(request: Request): string {
  return (
    parseCorrelationId(request.headers.get(CORRELATION_ID_HEADER)) ??
    newCorrelationId()
  );
}

/**
 * Stamps the id onto a response so the caller can quote it in a bug report.
 * Returns the same response object for call-site chaining.
 */
export function withCorrelationId<T extends Response>(
  response: T,
  correlationId: string
): T {
  response.headers.set(CORRELATION_ID_HEADER, correlationId);
  return response;
}

/**
 * The correlation id for background work descending from a job. Falls back
 * to deriving one from the job id when the job predates this column
 * (existing rows are not backfilled — a synthetic-but-stable id keeps that
 * job's own events joinable to each other, which is the useful half, without
 * inventing a link to the HTTP request that started it).
 */
export function correlationIdForJob(job: {
  id: string;
  correlationId?: string | null;
}): string {
  return parseCorrelationId(job.correlationId) ?? `job-${job.id}`;
}

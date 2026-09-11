/**
 * Pure retry/backoff policy for the outbound webhook dispatcher (issue
 * #261). No DB or network — exhaustively unit-testable.
 */

export const MAX_DELIVERY_ATTEMPTS = 6;
const MAX_BACKOFF_SECONDS = 300;

/** Exponential backoff, capped, in seconds — same shape as the platform's
 *  other outbox drainers (see docs/adr/0005-event-outbox-strategy.md). */
export function backoffSeconds(attempts: number): number {
  return Math.min(2 ** Math.max(attempts, 0), MAX_BACKOFF_SECONDS);
}

export function shouldDeadLetter(attempts: number): boolean {
  return attempts >= MAX_DELIVERY_ATTEMPTS;
}

export interface AttemptOutcome {
  attempts: number;
  ok: boolean;
}

export interface NextEventState {
  status: "sent" | "pending" | "dead";
  availableInSeconds: number;
}

/** What the outbound_events row should become after one dispatch attempt. */
export function nextEventState(outcome: AttemptOutcome): NextEventState {
  if (outcome.ok) return { status: "sent", availableInSeconds: 0 };
  if (shouldDeadLetter(outcome.attempts)) return { status: "dead", availableInSeconds: 0 };
  return { status: "pending", availableInSeconds: backoffSeconds(outcome.attempts) };
}

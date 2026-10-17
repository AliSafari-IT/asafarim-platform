import { assertCanRunProviderCall, type ProviderCallKind } from "../tailoring/ai/quota";
import { errorCodeOf, recordCallOutcome, type CallOutcome, type RecordCallOutcome } from "./callOutcome";

/**
 * The shared provider-call runtime (issue #510): budget check → attempt
 * loop with retry → hand back either the value or the error that ended
 * the call. Every ResuMatch AI domain (tailor, cover letter, extraction,
 * summary rewrite, skill categorization, job-meta, AI job fetch) used to
 * carry its own copy of this loop; the retry count and backoff now live
 * here only.
 *
 * What stays in each domain: building the prompt, the provider call and
 * its spend recording (inside `call`), the billed-failure record and log
 * line for a failed attempt (`onAttemptFailed`), which errors are worth
 * retrying (`isRetryable`), and what to return when the call fails (the
 * domain's degraded fallback). This helper never logs and never builds a
 * fallback, so each domain keeps its own log event names and result shape.
 *
 * It never throws: a budget refusal (`QuotaExceededError`), an error from
 * `prepare`, a non-retryable error or the last failed attempt all come
 * back as `{ ok: false, error }`.
 *
 * Every call that gets here also leaves one outcome record (issue #512,
 * `callOutcome.ts`): success or the reason it degraded, and the number of
 * attempts. That write is best effort: if it fails, the call's result is
 * the same as if it had succeeded.
 */

/** Attempts per call, the first one included. */
export const MAX_ATTEMPTS = 3;

/** Linear backoff before the next attempt: 250 ms after the first failure,
 *  500 ms after the second. */
export function backoffMs(attempt: number): number {
  return 250 * attempt;
}

export type ProviderCallResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export interface RunProviderCallOptions<TContext, T> {
  workspaceId: string;
  kind: ProviderCallKind;
  /** Runs once, after the budget check and before the first attempt, e.g.
   *  to load the provider. An error here ends the call with no attempt. */
  prepare: () => Promise<TContext> | TContext;
  /** One attempt: the provider call plus whatever must succeed with it
   *  (spend recording, schema validation). A throw counts as a failed
   *  attempt. */
  call: (context: TContext, attempt: number) => Promise<T>;
  /** Runs after every failed attempt, before the retry decision. */
  onAttemptFailed: (error: unknown, context: TContext, attempt: number) => Promise<void> | void;
  /** Whether a failed attempt may be tried again. */
  isRetryable: (error: unknown) => boolean;
  /** Tests only. */
  sleep?: (ms: number) => Promise<void>;
  /** Tests only; defaults to writing an `ai_call_outcomes` row. */
  recordOutcome?: RecordCallOutcome;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runProviderCallWithBudget<TContext, T>(
  opts: RunProviderCallOptions<TContext, T>,
): Promise<ProviderCallResult<T>> {
  const sleep = opts.sleep ?? defaultSleep;
  let phase: "budget" | "prepare" | "attempts" = "budget";
  let attempts = 0;
  // Set by the attempt loop just before it gives up; still null if
  // `onAttemptFailed` threw.
  let attemptEnd: CallOutcome | null = null;

  let result: ProviderCallResult<T>;
  let outcome: CallOutcome;
  try {
    await assertCanRunProviderCall(opts.workspaceId, opts.kind);
    phase = "prepare";
    const context = await opts.prepare();
    phase = "attempts";

    for (let attempt = 1; ; attempt++) {
      attempts = attempt;
      try {
        result = { ok: true, value: await opts.call(context, attempt) };
        outcome = "success";
        break;
      } catch (err) {
        await opts.onAttemptFailed(err, context, attempt);
        if (attempt >= MAX_ATTEMPTS) {
          attemptEnd = "exhausted";
          throw err;
        }
        if (!opts.isRetryable(err)) {
          attemptEnd = "non_retryable";
          throw err;
        }
        await sleep(backoffMs(attempt));
      }
    }
  } catch (error) {
    result = { ok: false, error };
    outcome =
      phase === "budget"
        ? isQuotaRefusal(error)
          ? "budget_refused"
          : "budget_check_failed"
        : phase === "prepare"
          ? "prepare_failed"
          : (attemptEnd ?? "attempt_hook_failed");
  }

  try {
    await (opts.recordOutcome ?? recordCallOutcome)({
      workspaceId: opts.workspaceId,
      kind: opts.kind,
      outcome,
      attempts,
      degraded: !result.ok,
      // No fallback provider exists yet (#511).
      usedFallback: false,
      errorCode: result.ok ? null : errorCodeOf(result.error),
    });
  } catch {
    // Best effort: an outcome record must never change the call's result.
  }
  return result;
}

/** `QuotaExceededError` from `quota.ts`, matched by name so this module
 *  doesn't need the class at runtime. */
function isQuotaRefusal(error: unknown): boolean {
  return error instanceof Error && error.name === "QuotaExceededError";
}

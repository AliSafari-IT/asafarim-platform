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
 * Cross-provider fallback (issue #511): when a domain passes `fallback`
 * and the primary provider's last attempt fails with a retryable error,
 * the call gets one more attempt against the fallback provider's context
 * before it degrades. A non-retryable error, a budget refusal or a failed
 * `prepare` never reaches the fallback: those say "this input can't be
 * served" or "don't spend", not "this provider is down".
 *
 * Every call that gets here also leaves one outcome record (issue #512,
 * `callOutcome.ts`): success or the reason it degraded, the number of
 * attempts (a fallback attempt included) and whether the fallback was
 * tried. That write is best effort: if it fails, the call's result is the
 * same as if it had succeeded.
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
  /** Issue #511: the fallback provider, tried once after the primary's
   *  attempts are exhausted on a retryable error. Its context goes to the
   *  same `call` and `onAttemptFailed`, so the domain records spend and
   *  failures under the provider that actually served the attempt. Omitted
   *  or null: no fallback. */
  fallback?: { prepare: () => Promise<TContext> | TContext } | null;
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
  let usedFallback = false;
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

    let value: T | undefined;
    let served = false;
    let lastError: unknown;
    for (let attempt = 1; ; attempt++) {
      attempts = attempt;
      try {
        value = await opts.call(context, attempt);
        served = true;
        break;
      } catch (err) {
        await opts.onAttemptFailed(err, context, attempt);
        if (attempt >= MAX_ATTEMPTS) {
          lastError = err;
          break;
        }
        if (!opts.isRetryable(err)) {
          attemptEnd = "non_retryable";
          throw err;
        }
        await sleep(backoffMs(attempt));
      }
    }

    if (!served) {
      // The primary is exhausted. Only a retryable last error ("this
      // provider is unavailable") is worth a second provider.
      if (!opts.fallback || !opts.isRetryable(lastError)) {
        attemptEnd = "exhausted";
        throw lastError;
      }
      usedFallback = true;
      // A fallback that can't even load still ends the call as exhausted;
      // its error code says why.
      attemptEnd = "exhausted";
      const fallbackContext = await opts.fallback.prepare();
      attemptEnd = null;
      attempts += 1;
      try {
        value = await opts.call(fallbackContext, attempts);
      } catch (err) {
        await opts.onAttemptFailed(err, fallbackContext, attempts);
        attemptEnd = "exhausted";
        throw err;
      }
    }

    result = { ok: true, value: value as T };
    outcome = "success";
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
      usedFallback,
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

import { assertCanRunProviderCall, type ProviderCallKind } from "../tailoring/ai/quota";

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
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function runProviderCallWithBudget<TContext, T>(
  opts: RunProviderCallOptions<TContext, T>,
): Promise<ProviderCallResult<T>> {
  const sleep = opts.sleep ?? defaultSleep;
  try {
    await assertCanRunProviderCall(opts.workspaceId, opts.kind);
    const context = await opts.prepare();

    for (let attempt = 1; ; attempt++) {
      try {
        return { ok: true, value: await opts.call(context, attempt) };
      } catch (err) {
        await opts.onAttemptFailed(err, context, attempt);
        if (attempt >= MAX_ATTEMPTS || !opts.isRetryable(err)) throw err;
        await sleep(backoffMs(attempt));
      }
    }
  } catch (error) {
    return { ok: false, error };
  }
}

import { getJobmatchDb } from "../db/client";
import type { ProviderCallKind } from "../tailoring/ai/quota";

/**
 * Per-call outcome records (issue #512). The shared runtime
 * (`runProviderCall.ts`) writes one row per provider call, whatever the
 * result, so retry, degrade and (once #511 lands) fallback rates are
 * queryable without grepping logs. The spend ledgers (`AiUsageLedger`,
 * `ai_cost_events`) stay success-only and are not touched here.
 *
 * A row holds ids, the call kind, the outcome, the attempt count and a
 * stable error code. Never a prompt, a response, CV or job text, or an
 * error message (messages can echo provider output or connection details).
 */

export type CallOutcome =
  /** A provider attempt succeeded. */
  | "success"
  /** The workspace budget refused the call; no attempt was made. */
  | "budget_refused"
  /** The budget check itself failed (e.g. the database); no attempt. */
  | "budget_check_failed"
  /** `prepare` (provider load) failed; no attempt. */
  | "prepare_failed"
  /** An attempt failed with an error the domain does not retry. */
  | "non_retryable"
  /** Every attempt (`MAX_ATTEMPTS`) failed. */
  | "exhausted"
  /** The domain's per-attempt failure hook threw, which ends the call. */
  | "attempt_hook_failed";

export const CALL_OUTCOMES: readonly CallOutcome[] = [
  "success",
  "budget_refused",
  "budget_check_failed",
  "prepare_failed",
  "non_retryable",
  "exhausted",
  "attempt_hook_failed",
];

export interface CallOutcomeRecord {
  workspaceId: string;
  kind: ProviderCallKind;
  outcome: CallOutcome;
  attempts: number;
  degraded: boolean;
  usedFallback: boolean;
  errorCode: string | null;
}

export type RecordCallOutcome = (record: CallOutcomeRecord) => Promise<void>;

const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

/**
 * A stable, non-sensitive label for the error that ended a call: the
 * error's string `code` or `reason` if it looks like an identifier, else its
 * class name, else `"unknown"`. Never the message.
 */
export function errorCodeOf(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const { code, reason } = error as { code?: unknown; reason?: unknown };
    if (typeof code === "string" && CODE_PATTERN.test(code)) return code;
    if (typeof reason === "string" && CODE_PATTERN.test(reason)) return reason;
  }
  if (error instanceof Error && CODE_PATTERN.test(error.name)) return error.name;
  return "unknown";
}

/** The default writer: one `ai_call_outcomes` row. Callers treat it as
 *  best effort and swallow its errors. */
export const recordCallOutcome: RecordCallOutcome = async (record) => {
  await getJobmatchDb().aiCallOutcome.create({ data: record });
};

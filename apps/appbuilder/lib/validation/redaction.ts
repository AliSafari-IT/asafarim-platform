import { buildSafeSummary, redactForLogging } from "@asafarim/appbuilder-ai";

/**
 * M10's own thin wrapper around @asafarim/appbuilder-ai's redaction layer —
 * reused directly rather than reimplemented (issue requirement: "gather
 * only bounded, sanitized diagnostics"). Applied to EVERYTHING that reaches
 * `validation_gate_results.structuredFailures`/`evidence`,
 * `repair_attempts.diagnosticsSummary`, or a `proposeRepair` prompt —
 * anything derived from a gate's execution (browser console/network
 * output, DB error messages, model responses) is treated as untrusted for
 * this purpose, exactly like a raw provider response.
 */

const MAX_FAILURES_PERSISTED = 20;
const MAX_MESSAGE_LENGTH = 2_000;
const MAX_DIAGNOSTICS_STRING_LENGTH = 4_000;

export interface RedactableFailure {
  code: string;
  message: string;
  path?: (string | number)[];
}

/** Bounds and redacts a gate's structured failures before they are ever persisted or shown to a repair proposal. */
export function redactFailures(failures: RedactableFailure[]): RedactableFailure[] {
  return failures.slice(0, MAX_FAILURES_PERSISTED).map((failure) => ({
    code: failure.code,
    message: String(redactForLogging(failure.message.slice(0, MAX_MESSAGE_LENGTH))),
    path: failure.path,
  }));
}

/**
 * Bounds and redacts a free-form diagnostics object (browser console lines,
 * network summaries, DB error text) before it is persisted as
 * `repair_attempts.diagnosticsSummary` or `validation_gate_results.evidence`,
 * or sent to `proposeRepair`. Every string value is truncated in addition to
 * being redacted — a single pathological log line must never blow the
 * bounded diagnostics budget.
 */
export function redactDiagnostics(fields: Record<string, unknown>): Record<string, unknown> {
  const truncateStrings = (value: unknown): unknown => {
    if (typeof value === "string") return value.slice(0, MAX_DIAGNOSTICS_STRING_LENGTH);
    if (Array.isArray(value)) return value.map(truncateStrings);
    if (value && typeof value === "object") {
      return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, truncateStrings(v)]));
    }
    return value;
  };
  return buildSafeSummary(truncateStrings(fields) as Record<string, unknown>);
}

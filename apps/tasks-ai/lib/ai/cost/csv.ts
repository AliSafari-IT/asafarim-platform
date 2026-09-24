import "server-only";
import { effectiveCost, microsToDecimalString } from "@asafarim/ai-cost-ledger";
import type { RequestContext } from "../../context";
import { loadCostRows, type TasksAiCostFilter } from "./read";

const HEADER = [
  "occurred_at_utc",
  "operation",
  "attribution",
  "project_id",
  "task_id",
  "ai_job_id",
  "provider",
  "model",
  "prompt_version",
  "outcome",
  "input_tokens",
  "output_tokens",
  "amount_usd",
  "cost_basis",
  "cost_source",
  "payer",
  "legacy",
];

/** RFC 4180 field quoting, plus a guard against spreadsheet formula injection. */
function cell(value: string | number | null): string {
  if (value === null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The current *authorized* filter scope as CSV (issue #591): the same rows
 * the viewer can see on the page, never more. Operational metadata only —
 * no prompt, task title or description. The actor is deliberately not a
 * column: this is a cost export, not a per-person report. Unknown cost is
 * an empty amount with basis `unknown`, never 0.
 */
export async function exportCostCsv(ctx: RequestContext, filter: TasksAiCostFilter): Promise<string> {
  const rows = await loadCostRows(ctx, filter);
  const lines = [HEADER.join(",")];
  for (const r of rows) {
    const { amountMicros, basis } = effectiveCost(r);
    lines.push(
      [
        r.occurredAt.toISOString(),
        r.operation,
        r.attribution,
        r.projectId,
        r.taskId,
        r.aiJobId,
        r.provider,
        r.model,
        r.promptVersion,
        r.outcome,
        r.inputTokens ?? 0,
        r.outputTokens ?? 0,
        amountMicros === null ? null : microsToDecimalString(amountMicros),
        basis,
        r.costSource,
        r.credentialSource,
        r.legacy ? "yes" : "no",
      ]
        .map(cell)
        .join(","),
    );
  }
  return lines.join("\r\n") + "\r\n";
}

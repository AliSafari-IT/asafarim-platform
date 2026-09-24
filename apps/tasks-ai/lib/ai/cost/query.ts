import { CostTimelineQuerySchema, resolveRange } from "@asafarim/ai-cost-ledger";
import { AI_KINDS } from "../types";
import type { TasksAiCostFilter } from "./read";

/**
 * One parser for the AI cost page, its JSON API and its CSV export
 * (issue #591), so a shared URL means the same filter everywhere. Only
 * filter values come from the URL — the workspace and the viewer's role
 * always come from the session, and every id is resolved inside the
 * repository's authorization scope (lib/ai/cost/read.ts).
 */
const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseCostQuery(
  params: URLSearchParams | Record<string, string | string[] | undefined>,
  now: Date = new Date(),
) {
  const get = (k: string) => {
    if (params instanceof URLSearchParams) return params.get(k) ?? undefined;
    const v = params[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const dateToIso = (v: string | undefined, end: boolean) => {
    if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return undefined;
    const d = new Date(`${v}T00:00:00.000Z`);
    if (Number.isNaN(d.getTime())) return undefined;
    if (end) d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString();
  };
  const parsed = CostTimelineQuerySchema.safeParse({
    preset: get("preset") || undefined,
    from: dateToIso(get("from"), false),
    to: dateToIso(get("to"), true),
    cursor: get("cursor") || undefined,
    limit: get("limit") || undefined,
    operation: get("operation") || undefined,
    provider: get("provider") || undefined,
    model: get("model") || undefined,
    status: get("status") || undefined,
  });
  const query = parsed.success ? parsed.data : CostTimelineQuerySchema.parse({});
  const range = resolveRange(query, now);
  const project = get("project");
  const task = get("task");
  const operations = (query.operation ?? "").split(",").filter((op) => (AI_KINDS as readonly string[]).includes(op));

  const filter: TasksAiCostFilter = {
    range,
    projectId: project && ID.test(project) ? project : null,
    taskId: task && ID.test(task) ? task : null,
    operations: operations.length ? operations : undefined,
    provider: query.provider,
    model: query.model,
    status: query.status,
    mine: get("mine") === "1",
  };
  return {
    filter,
    cursor: query.cursor ?? null,
    limit: query.limit,
    values: {
      preset: query.preset,
      from: range.from.toISOString().slice(0, 10),
      to: new Date(range.to.getTime() - 1).toISOString().slice(0, 10),
      project: filter.projectId ?? "",
      task: filter.taskId ?? "",
      operation: operations.join(","),
      provider: query.provider ?? "",
      model: query.model ?? "",
      status: query.status?.join(",") ?? "",
      mine: filter.mine ? "1" : "",
    },
  };
}

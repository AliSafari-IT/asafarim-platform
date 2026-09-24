import { CostTimelineQuerySchema, resolveRange, type CostTimelineQuery } from "@asafarim/ai-cost-ledger";
import type { ResumatchCostOperation } from "./ledger";
import type { CostFilter } from "./read";

/**
 * One parser for the `/ai-usage` page and `GET /api/ai-usage`, so a
 * shareable URL means exactly the same filter in both places.
 *
 * Only filter *values* come from the URL — never a workspace or owner id.
 * `job` is a TargetJob id, and every query it feeds is already scoped to
 * the session's workspace (lib/costs/read.ts), so a job id from someone
 * else's account matches nothing rather than leaking anything.
 */

export const RESUMATCH_OPERATIONS: readonly ResumatchCostOperation[] = [
  "extract",
  "fetch_job",
  "job_meta",
  "tailor",
  "cover_letter",
  "rewrite",
  "categorize_skills",
];

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const GROUP = /^(job:[A-Za-z0-9_-]{1,64}|profile|legacy)$/;

export interface ParsedCostQuery {
  query: CostTimelineQuery;
  filter: CostFilter;
  cursor: string | null;
  limit: number;
  /** The raw, validated values — for re-rendering the filter form. */
  values: {
    preset: string;
    from: string;
    to: string;
    job: string;
    operation: string;
    provider: string;
    model: string;
    status: string;
  };
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** `YYYY-MM-DD` from a date input → an ISO instant at UTC midnight. */
function dateInputToIso(value: string | undefined, endOfDay: boolean): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return undefined;
  if (endOfDay) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

export function parseCostQuery(
  params: Record<string, string | string[] | undefined> | URLSearchParams,
  now: Date = new Date(),
): ParsedCostQuery {
  const get = (key: string) =>
    params instanceof URLSearchParams ? (params.get(key) ?? undefined) : first(params[key]);

  const job = get("job");
  const group = get("group");
  const operation = get("operation");
  const status = get("status");

  const parsed = CostTimelineQuerySchema.safeParse({
    preset: get("preset") || undefined,
    from: dateInputToIso(get("from"), false),
    to: dateInputToIso(get("to"), true),
    cursor: get("cursor") || undefined,
    limit: get("limit") || undefined,
    operation: operation || undefined,
    provider: get("provider") || undefined,
    model: get("model") || undefined,
    status: status || undefined,
  });
  const query = parsed.success ? parsed.data : CostTimelineQuerySchema.parse({});
  const range = resolveRange(query, now);

  const operations = (query.operation ?? "")
    .split(",")
    .filter((op): op is ResumatchCostOperation => (RESUMATCH_OPERATIONS as readonly string[]).includes(op));

  return {
    query,
    cursor: query.cursor ?? null,
    limit: query.limit,
    filter: {
      range,
      targetJobId: job && ID.test(job) ? job : null,
      group: group && GROUP.test(group) ? group : null,
      operations: operations.length ? operations : undefined,
      provider: query.provider,
      model: query.model,
      status: query.status,
    },
    values: {
      preset: query.preset,
      from: range.from.toISOString().slice(0, 10),
      to: new Date(range.to.getTime() - 1).toISOString().slice(0, 10),
      job: job && ID.test(job) ? job : "",
      operation: operations.join(","),
      provider: query.provider ?? "",
      model: query.model ?? "",
      status: query.status?.join(",") ?? "",
    },
  };
}

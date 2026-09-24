import { CostTimelineQuerySchema, resolveRange } from "@asafarim/ai-cost-ledger";
import type { ViontoCostFilter } from "./cost-read";

/**
 * One parser for `/usage/ai` and `GET /api/usage/ai` (issue #589), so a
 * shared link means the same filter everywhere. Only filter values come
 * from the URL; the user always comes from the session, and every id here
 * is matched *inside* that user's own rows — a foreign project/export id
 * simply matches nothing.
 */
export const VIONTO_COST_OPERATIONS = ["story", "vision_caption", "tts", "tts_preview", "ai_motion_clip"] as const;

const ID = /^[A-Za-z0-9_-]{1,64}$/;

export function parseViontoCostQuery(params: URLSearchParams, now: Date = new Date()) {
  const get = (k: string) => params.get(k) ?? undefined;
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
    operation: get("category") || undefined,
    provider: get("provider") || undefined,
    model: get("model") || undefined,
    status: get("status") || undefined,
    credential: get("payer") || undefined,
  });
  const query = parsed.success ? parsed.data : CostTimelineQuerySchema.parse({});
  const range = resolveRange(query, now);
  const projectId = get("projectId");
  const exportId = get("exportId");
  const operations = (query.operation ?? "")
    .split(",")
    .filter((op) => (VIONTO_COST_OPERATIONS as readonly string[]).includes(op));

  const filter: ViontoCostFilter = {
    range,
    projectId: projectId && ID.test(projectId) ? projectId : null,
    exportId: exportId && ID.test(exportId) ? exportId : null,
    unattachedOnly: get("unattached") === "1",
    operations: operations.length ? operations : undefined,
    provider: query.provider,
    model: query.model,
    status: query.status,
    credential: query.credential,
  };
  return { filter, cursor: query.cursor ?? null, limit: query.limit };
}

import { NextResponse } from "next/server";
import { CostRangeTooLargeError, buildCostTimeline } from "../../../lib/costs/read";
import { parseCostQuery } from "../../../lib/costs/query";
import { getCurrentWorkspace } from "../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * The candidate's own AI provider cost timeline (issue #587): summary,
 * per-job subtotals and one page of line items, as JSON. The workspace
 * comes from the session — never from the request — so the only thing a
 * caller can vary is the filter. Operational metadata only: no prompt,
 * CV, job text or model output is ever part of this response.
 */
export async function GET(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { filter, cursor, limit } = parseCostQuery(new URL(request.url).searchParams);
  try {
    const timeline = await buildCostTimeline(workspace.id, filter, { cursor, limit });
    return NextResponse.json(timeline, { headers: { "cache-control": "private, no-store" } });
  } catch (error) {
    if (error instanceof CostRangeTooLargeError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    throw error;
  }
}

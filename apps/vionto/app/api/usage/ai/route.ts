import { NextResponse } from "next/server";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { CostRangeTooLargeError, buildViontoCostTimeline } from "@/lib/server/ai/cost-read";
import { parseViontoCostQuery } from "@/lib/server/ai/cost-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/usage/ai — the signed-in user's own AI provider cost timeline
 * (issue #589): grand total, per-project and per-final-video subtotals, and
 * one page of provider calls. Personal scope only: a shared project never
 * exposes a collaborator's calls or BYOK spend. Operational metadata only —
 * no prompts, captions, narration text or media.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();
    const { filter, cursor, limit } = parseViontoCostQuery(new URL(req.url).searchParams);
    try {
      const timeline = await buildViontoCostTimeline(user.id, filter, { cursor, limit });
      return NextResponse.json(timeline, { headers: { "cache-control": "private, no-store" } });
    } catch (error) {
      if (error instanceof CostRangeTooLargeError) {
        return NextResponse.json({ error: error.message }, { status: 422 });
      }
      throw error;
    }
  } catch (error) {
    return serverError("usage/ai", error);
  }
}

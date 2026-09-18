import { NextResponse } from "next/server";
import { rewriteSummaryWithFallback } from "../../../../../lib/profile/ai/degraded";
import { SUMMARY_TONES, type SummaryTone } from "../../../../../lib/profile/ai/provider";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

function isSummaryTone(value: unknown): value is SummaryTone {
  return typeof value === "string" && (SUMMARY_TONES as readonly string[]).includes(value);
}

/**
 * Preview a tone-rewritten Summary. This never touches the saved profile —
 * it only returns a suggestion; the candidate accepts it client-side by
 * setting the form field, and it becomes real only once they Save (and,
 * per the rest of this app's posture, Confirm).
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { currentSummary, tone } = (body ?? {}) as { currentSummary?: unknown; tone?: unknown };

  if (typeof currentSummary !== "string" || currentSummary.trim().length === 0) {
    return NextResponse.json({ error: "There is no summary text to rewrite yet." }, { status: 400 });
  }
  if (!isSummaryTone(tone)) {
    return NextResponse.json({ error: `Tone must be one of: ${SUMMARY_TONES.join(", ")}.` }, { status: 400 });
  }

  const result = await rewriteSummaryWithFallback(workspace.id, currentSummary, tone);
  return NextResponse.json({ rewritten: result.text, degraded: result.degraded });
}

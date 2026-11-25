import { NextResponse } from "next/server";
import { getJobmatchDb } from "../../../../../lib/db/client";
import { readFeedbackItems, readOriginalSuggestions, reconstructFeedback } from "../../../../../lib/tailoring/feedback";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * #932: the review feedback of one saved CV, reconstructed from the stored
 * records: each AI suggestion as generated, what the candidate did with it
 * (kept, edited, left out), what was saved, the optional reason, and the
 * outcome of anything they chose to remember. Workspace-scoped: another
 * workspace's CV id reads as not found. 404 too for a CV with no feedback
 * (saved before 0.6.10, from a legacy preview, or edited in place only).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });
  const { id } = await params;
  const row = await getJobmatchDb().tailoringFeedback.findFirst({
    where: { tailoredResumeId: id, workspaceId: workspace.id },
    select: { feedbackVersion: true, original: true, decisions: true, promotions: true, createdAt: true },
  });
  if (!row) return NextResponse.json({ error: "No feedback recorded for this CV." }, { status: 404 });
  const original = readOriginalSuggestions(row.original);
  const stored = (row.original ?? {}) as Record<string, unknown>;
  return NextResponse.json({
    feedbackVersion: row.feedbackVersion,
    recordedAt: row.createdAt.toISOString(),
    provenance: {
      promptVersion: typeof stored.promptVersion === "string" ? stored.promptVersion : null,
      modelVersion: typeof stored.modelVersion === "string" ? stored.modelVersion : null,
      coverLetterPromptVersion: typeof stored.coverLetterPromptVersion === "string" ? stored.coverLetterPromptVersion : null,
      coverLetterModelVersion: typeof stored.coverLetterModelVersion === "string" ? stored.coverLetterModelVersion : null,
    },
    items: reconstructFeedback(original, readFeedbackItems(row.decisions)),
    promotions: row.promotions ?? null,
  });
}

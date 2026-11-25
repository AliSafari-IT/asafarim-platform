import { NextResponse } from "next/server";
import { z } from "zod";
import { getJobmatchDb } from "../../../../lib/db/client";
import { loadGenerationEvidence } from "../../../../lib/evidence/store";
import { getVersion } from "../../../../lib/profile/versions";
import { parseStoredTailoringContext } from "../../../../lib/tailoring/context";
import { MAX_CV_BULLET_CHARS } from "../../../../lib/tailoring/candidateEdits";
import { recheckClaims } from "../../../../lib/tailoring/selection/claims";
import { evidenceRelevanceForJob, selectTailoringInputs } from "../../../../lib/tailoring/selection/select";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const dynamic = "force-dynamic";

/** Most texts one request rechecks: every bullet on a long review. */
const MAX_ITEMS = 80;

const bodySchema = z
  .object({
    previewId: z.string().min(1).max(100),
    items: z
      .array(
        z
          .object({
            field: z.enum(["headline", "summary", "bullet"]),
            experienceIndex: z.number().int().min(0).max(100).nullable(),
            text: z.string().max(MAX_CV_BULLET_CHARS),
          })
          .strict(),
      )
      .min(1)
      .max(MAX_ITEMS),
  })
  .strict();

/**
 * #964: check text the candidate edited on the Tailor review again, against
 * the same sources the preview's own check used: the preview's profile
 * version, its job, the confirmed evidence the run had and the
 * requirements the candidate said no to. Deterministic, no AI call, no
 * write. Advisory: it tells the review whether an issue is gone; the save
 * never depends on it.
 */
export async function POST(request: Request) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  const { previewId, items } = parsed.data;

  const db = getJobmatchDb();
  // Workspace-scoped: another workspace's preview reads as missing.
  const preview = await db.tailorPreview.findFirst({
    where: { id: previewId, workspaceId: workspace.id },
    select: { profileVersionId: true, targetJobId: true, context: true },
  });
  if (!preview) return NextResponse.json({ error: "Preview not found." }, { status: 404 });
  const context = parseStoredTailoringContext(preview.context);

  const version = await getVersion(workspace.id, preview.profileVersionId);
  const job = await db.targetJob.findFirst({
    where: { id: preview.targetJobId, workspaceId: workspace.id },
    select: { rawText: true },
  });
  if (!version || !job?.rawText) return NextResponse.json({ error: "Preview not found." }, { status: 404 });

  // Only the evidence the run itself used, so a recheck agrees with the
  // first check about everything the candidate did not edit.
  const loaded = await loadGenerationEvidence(workspace.id, preview.targetJobId, version.content, evidenceRelevanceForJob(job.rawText));
  const used = new Set(context?.evidenceRevisionIds ?? loaded.revisionIds);
  const evidence = {
    ...loaded,
    professional: loaded.professional.filter((item) => used.has(item.revisionId)),
    motivation: loaded.motivation.filter((item) => used.has(item.revisionId)),
    revisionIds: loaded.revisionIds.filter((id) => used.has(id)),
  };
  const selection = selectTailoringInputs({
    profile: version.content,
    jobText: job.rawText,
    evidence,
    unmetRequirementIds: context?.selection?.unmetRequirementIds ?? [],
  });
  const issues = recheckClaims(items, {
    sources: selection.sources,
    requirements: selection.requirements,
    coverage: selection.coverage,
    outputLanguage: context?.cv.outputLanguage ?? null,
  });
  return NextResponse.json({ issues });
}

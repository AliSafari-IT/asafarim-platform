import { getJobmatchDb } from "../../../db/client";
import { parseTailoredResumeContent } from "../schema";
import { handEditProblem, normalizeHandEditedParagraph } from "./handEditRules";

/**
 * The candidate's own edit of a CV's skills paragraph (CV preview, "Edit
 * paragraph"). Their words are their own claims, as with the bullets they
 * write on the review (#927): saved as written (one paragraph, whitespace
 * tidied), never sent to a model and never fact-checked away. The preview
 * runs the AI check's rules over it as advice only (./advice.ts).
 *
 * Stored on the CV beside the AI's text, in the same column, so the
 * preview, the PDF and the DOCX keep using one resolution
 * (lib/tailoring/skillsLayout.ts). `skillsParagraphEditedAt` marks it as
 * hand-edited: Rewrite asks before replacing it, and clears the mark.
 */

export type HandEditOutcome =
  | { ok: true; paragraph: string }
  | { ok: false; reason: "not_found" | "empty" | "too_long" | "invalid" | "no_skills" };

export async function saveHandEditedSkillsParagraph(
  workspaceId: string,
  tailoredResumeId: string,
  text: unknown,
): Promise<HandEditOutcome> {
  if (typeof text !== "string") return { ok: false, reason: "invalid" };
  const problem = handEditProblem(text);
  if (problem) return { ok: false, reason: problem };
  const paragraph = normalizeHandEditedParagraph(text);

  const db = getJobmatchDb();
  const row = await db.tailoredResume.findFirst({
    where: { id: tailoredResumeId, workspaceId },
    select: { content: true, skillsParagraph: true },
  });
  if (!row) return { ok: false, reason: "not_found" };
  // The paragraph layout only exists on a CV with skills (resolveSkillsDisplay).
  if (parseTailoredResumeContent(row.content).skills.length === 0) return { ok: false, reason: "no_skills" };

  // Saving the text it already has is not an edit: an AI paragraph stays
  // an AI paragraph, and no PDF goes stale.
  if (row.skillsParagraph === paragraph) {
    await db.tailoredResume.updateMany({
      where: { id: tailoredResumeId, workspaceId },
      data: { skillsLayout: "paragraph" },
    });
    return { ok: true, paragraph };
  }

  await db.tailoredResume.updateMany({
    where: { id: tailoredResumeId, workspaceId },
    data: { skillsParagraph: paragraph, skillsLayout: "paragraph", skillsParagraphEditedAt: new Date() },
  });
  return { ok: true, paragraph };
}

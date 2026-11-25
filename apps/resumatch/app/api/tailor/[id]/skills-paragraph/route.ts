import { NextResponse } from "next/server";
import { writeSkillsParagraph } from "../../../../../lib/tailoring/ai/skillsParagraph/generate";
import { saveHandEditedSkillsParagraph } from "../../../../../lib/tailoring/ai/skillsParagraph/handEdit";
import { MAX_SKILLS_PARAGRAPH_LENGTH } from "../../../../../lib/tailoring/ai/skillsParagraph/handEditRules";
import { getCurrentWorkspace, recordAuditEvent } from "../../../../../lib/workspace";

export const dynamic = "force-dynamic";

/**
 * Write (or rewrite) the fact-based skills paragraph for one tailored CV and
 * switch the CV to the paragraph layout. Takes no input: the paragraph is
 * written from the CV's own skill list only, and checked before it is
 * stored (lib/tailoring/ai/skillsParagraph). One AI call per request.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  const { id } = await params;
  const outcome = await writeSkillsParagraph(workspace.id, id);
  if (outcome.ok) {
    return NextResponse.json({ paragraph: outcome.paragraph, removedSentences: outcome.removedSentences });
  }
  switch (outcome.reason) {
    case "not_found":
      return NextResponse.json({ error: "Not found.", code: outcome.reason }, { status: 404 });
    case "no_skills":
      return NextResponse.json({ error: "This CV has no skills to describe.", code: outcome.reason }, { status: 400 });
    case "budget":
      return NextResponse.json({ error: "The monthly AI budget is used up.", code: outcome.reason }, { status: 429 });
    default:
      return NextResponse.json({ error: "The paragraph could not be written.", code: outcome.reason }, { status: 502 });
  }
}

/**
 * Save the candidate's own edit of the paragraph: `{ paragraph: string }`.
 * No AI call and no fact check (their words are their own claims); one
 * paragraph of at most MAX_SKILLS_PARAGRAPH_LENGTH characters. Switches
 * the CV to the paragraph layout, like a written paragraph does.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const workspace = await getCurrentWorkspace();
  if (!workspace) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body.", code: "invalid" }, { status: 400 });
  }
  const paragraph =
    body && typeof body === "object" && !Array.isArray(body) ? (body as { paragraph?: unknown }).paragraph : undefined;

  const { id } = await params;
  const outcome = await saveHandEditedSkillsParagraph(workspace.id, id, paragraph);
  if (outcome.ok) {
    // No text in the audit trail: it is CV content.
    await recordAuditEvent(workspace.id, "tailoring.skills_paragraph_edited", { tailoringId: id });
    return NextResponse.json({ paragraph: outcome.paragraph });
  }
  switch (outcome.reason) {
    case "not_found":
      return NextResponse.json({ error: "Not found.", code: outcome.reason }, { status: 404 });
    case "empty":
      return NextResponse.json({ error: "Write the paragraph before saving.", code: outcome.reason }, { status: 400 });
    case "too_long":
      return NextResponse.json(
        { error: `Keep the paragraph under ${MAX_SKILLS_PARAGRAPH_LENGTH} characters.`, code: outcome.reason },
        { status: 400 },
      );
    case "no_skills":
      return NextResponse.json({ error: "This CV has no skills to describe.", code: outcome.reason }, { status: 400 });
    default:
      return NextResponse.json({ error: "Invalid request body.", code: "invalid" }, { status: 400 });
  }
}

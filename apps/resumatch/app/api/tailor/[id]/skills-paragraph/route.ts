import { NextResponse } from "next/server";
import { writeSkillsParagraph } from "../../../../../lib/tailoring/ai/skillsParagraph/generate";
import { getCurrentWorkspace } from "../../../../../lib/workspace";

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

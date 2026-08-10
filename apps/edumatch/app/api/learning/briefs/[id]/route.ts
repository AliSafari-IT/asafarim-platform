import { NextResponse } from "next/server";
import { requireStudentAutoProvision } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { briefPatchSchema } from "@/lib/server/learning-brief";
import { getBrief, patchBrief } from "@/lib/server/learning-briefs";

export const runtime = "nodejs";

/** GET /api/learning/briefs/[id] — the brief plus its full transcript. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;
    return NextResponse.json(await getBrief(id, user.id));
  } catch (error) {
    return handleBriefError("learning/briefs/[id]", error);
  }
}

/**
 * PATCH /api/learning/briefs/[id]
 *
 * Student corrections on the review screen. Their edits always win over the
 * AI's reading — the brief is the student's document, and confirming something
 * they can't fix would make the review step theatre.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudentAutoProvision();
    const { id } = await params;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = briefPatchSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const brief = await patchBrief(id, user.id, parsed.data);
    return NextResponse.json({ brief });
  } catch (error) {
    return handleBriefError("learning/briefs/[id]", error);
  }
}

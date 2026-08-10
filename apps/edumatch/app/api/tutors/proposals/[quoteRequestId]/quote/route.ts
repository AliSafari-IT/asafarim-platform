import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { proposalAdjustmentSchema } from "@/lib/server/proposal-validation";
import {
  adjustProposal,
  getOrCreatePreparedProposal,
} from "@/lib/server/lesson-proposals";

export const runtime = "nodejs";

/**
 * PATCH /api/tutors/proposals/[quoteRequestId]/quote
 *
 * Adjust the prepared proposal. Still a draft afterwards — adjusting is not
 * sending, and a tutor who edits and closes the tab has published nothing.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ quoteRequestId: string }> },
) {
  try {
    const { user } = await requireTutor();
    const { quoteRequestId } = await params;

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = proposalAdjustmentSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    // Resolves the tutor's draft for this request and re-checks the invite.
    const prepared = await getOrCreatePreparedProposal(quoteRequestId, user.id);
    const result = await adjustProposal(prepared.quoteId, user.id, parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    return handleBriefError("tutors/proposals/quote", error);
  }
}

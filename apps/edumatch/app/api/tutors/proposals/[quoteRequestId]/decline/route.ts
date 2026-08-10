import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { proposalDeclineSchema } from "@/lib/server/proposal-validation";
import {
  declineProposal,
  getOrCreatePreparedProposal,
} from "@/lib/server/lesson-proposals";

export const runtime = "nodejs";

/**
 * POST /api/tutors/proposals/[quoteRequestId]/decline
 *
 * The tutor passes on the request. Declining is a first-class action rather
 * than silence: the student learns sooner, and the tutor's response time still
 * counts, so being honest quickly is never penalised relative to ignoring it.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ quoteRequestId: string }> },
) {
  try {
    const { user } = await requireTutor();
    const { quoteRequestId } = await params;

    const body = (await req.json().catch(() => ({}))) as unknown;
    const parsed = proposalDeclineSchema.safeParse(body ?? {});
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const prepared = await getOrCreatePreparedProposal(quoteRequestId, user.id);
    await declineProposal(prepared.quoteId, user.id, parsed.data.reason);

    return NextResponse.json({ declined: true });
  } catch (error) {
    return handleBriefError("tutors/proposals/decline", error);
  }
}

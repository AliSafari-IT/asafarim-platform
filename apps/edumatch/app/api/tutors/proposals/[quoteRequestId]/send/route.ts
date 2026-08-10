import { NextResponse } from "next/server";
import { requireTutor } from "@/lib/server/profiles";
import { badRequest } from "@/lib/server";
import { handleBriefError } from "@/lib/server/brief-errors";
import { formatZodError } from "@/lib/server/validation";
import { proposalAdjustmentSchema } from "@/lib/server/proposal-validation";
import {
  adjustProposal,
  getOrCreatePreparedProposal,
  sendProposal,
} from "@/lib/server/lesson-proposals";

export const runtime = "nodejs";

/**
 * POST /api/tutors/proposals/[quoteRequestId]/send
 *
 * The tutor approves the proposal and it becomes visible to the student. This
 * is the only endpoint that does that — there is no automatic send anywhere in
 * the system, by design.
 *
 * An optional body applies last-second edits in the same call, so "change the
 * rate and send" is one action rather than two round-trips.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ quoteRequestId: string }> },
) {
  try {
    const { user } = await requireTutor();
    const { quoteRequestId } = await params;

    const raw = (await req.json().catch(() => ({}))) as unknown;
    const parsed = proposalAdjustmentSchema.safeParse(raw ?? {});
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const prepared = await getOrCreatePreparedProposal(quoteRequestId, user.id);
    if (Object.keys(parsed.data).length > 0) {
      await adjustProposal(prepared.quoteId, user.id, parsed.data);
    }

    const sent = await sendProposal(prepared.quoteId, user.id);
    return NextResponse.json(sent, { status: 201 });
  } catch (error) {
    return handleBriefError("tutors/proposals/send", error);
  }
}

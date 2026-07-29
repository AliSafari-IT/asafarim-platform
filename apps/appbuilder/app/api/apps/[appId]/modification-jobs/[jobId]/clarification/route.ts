import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { submitClarificationAnswer } from "@/lib/repositories/modificationJobs";
import { ClarificationAnswerBody } from "@/lib/validation/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { nudgeModificationWorker } from "@/lib/server/queue";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/**
 * Submits an authorized owner/editor's answer to a modification job's
 * pending clarification question and resumes it (M13 slice E). The request
 * body is untrusted input, validated against the same bounded shape the
 * repository layer re-checks against the job's actual pending question
 * before it is ever accepted — see lib/repositories/modificationJobs.ts#
 * submitClarificationAnswer.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ClarificationAnswerBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A valid answer (a selected choice or free text) is required." }, { status: 400 });
  }

  try {
    const db = getDb();
    const job = await submitClarificationAnswer(db, actor, appId, jobId, parsed.data);
    await nudgeModificationWorker(job.id, { cause: "resume" });
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

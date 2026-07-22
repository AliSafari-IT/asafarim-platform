import { NextResponse } from "next/server";
import { z } from "zod";
import { ClarificationAnswer } from "@asafarim/appbuilder-ai";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { submitClarificationAnswers } from "@/lib/repositories/generationJobs";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { nudgeWorker } from "@/lib/server/queue";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

const Body = z.object({
  roundNumber: z.number().int().min(1),
  answers: z.array(ClarificationAnswer).min(1).max(20),
});

/**
 * Submits an authorized owner/editor's answers to the job's current
 * clarification round and resumes generation. The request body is
 * untrusted input, validated against the same bounded schema the
 * generation pipeline itself uses (@asafarim/appbuilder-ai's
 * ClarificationAnswer) before it ever reaches the repository layer.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid clarification submission." }, { status: 400 });
  }

  try {
    const job = await submitClarificationAnswers(getDb(), actor, appId, jobId, parsed.data);
    await nudgeWorker(job.id, { cause: "resume" });
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

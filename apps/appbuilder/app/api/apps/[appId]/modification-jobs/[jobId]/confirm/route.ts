import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { confirmModification } from "@/lib/repositories/modificationJobs";
import { updateMessageConfirmationState, findMessageByJobId } from "@/lib/repositories/conversations";
import { ConfirmModificationBody } from "@/lib/validation/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { nudgeModificationWorker } from "@/lib/server/queue";

interface RouteParams {
  params: Promise<{ appId: string; jobId: string }>;
}

/**
 * Confirms a destructive modification proposal. The confirmation is bound
 * to the requesting actor, this app, the job's base version, and the exact
 * proposal checksum the client must echo back (see
 * lib/modification/confirmation.ts) — never trusted from the model, and
 * never generalized from the fact that some *other* action was previously
 * approved. On success, resumes the worker to actually apply the change.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId, jobId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = ConfirmModificationBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "A checksum is required to confirm this change." }, { status: 400 });
  }

  try {
    const db = getDb();
    const job = await confirmModification(db, actor, appId, jobId, parsed.data);
    const message = await findMessageByJobId(db, appId, jobId);
    if (message) {
      await updateMessageConfirmationState(db, message.id, "confirmed");
    }
    await nudgeModificationWorker(job.id, { cause: "resume" });
    return NextResponse.json({ job });
  } catch (err) {
    return errorResponse(err);
  }
}

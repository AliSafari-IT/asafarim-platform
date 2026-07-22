import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { appendUserMessage, findMessageByJobId } from "@/lib/repositories/conversations";
import { enqueueModificationJob, getModificationJobByIdempotencyKey } from "@/lib/repositories/modificationJobs";
import { validateSelectionContext } from "@/lib/modification/selectionContext";
import { SendMessageBody } from "@/lib/validation/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { nudgeModificationWorker } from "@/lib/server/queue";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * Sends a conversational modification request: persists the user's message
 * (server-generated id, trusted session actor — never a client-supplied
 * identity), validates any attached preview-selection context against the
 * app's actual current specification, and enqueues a modification job to
 * interpret and (eventually, possibly after confirmation) apply it.
 *
 * Idempotent per `idempotencyKey`: a retried HTTP request (network retry,
 * double submit) with the SAME key returns the existing job (and its
 * original triggering message) rather than creating a second message and a
 * second job — checked BEFORE writing anything, not just at the job-enqueue
 * layer.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const actor = await getActor();
  if (!actor) return unauthorized();

  const { appId } = await params;
  const raw = await request.json().catch(() => null);
  const parsed = SendMessageBody.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }
  const { content, baseVersionNumber, selectionContext, idempotencyKey } = parsed.data;
  const key = idempotencyKey ?? randomUUID();

  try {
    const db = getDb();

    const existingJob = await getModificationJobByIdempotencyKey(db, actor, appId, key);
    if (existingJob) {
      const message = await findMessageByJobId(db, appId, existingJob.id);
      return NextResponse.json({ message, job: existingJob });
    }

    const validatedSelection = await validateSelectionContext(db, appId, selectionContext ?? null);

    const { message } = await appendUserMessage(db, actor, appId, {
      content,
      selectionContext: validatedSelection,
      baseVersionNumber,
    });

    const job = await enqueueModificationJob(db, actor, appId, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: content,
      selectionContext: validatedSelection,
      idempotencyKey: key,
    });
    await nudgeModificationWorker(job.id, { cause: "enqueue" });

    return NextResponse.json({ message, job }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

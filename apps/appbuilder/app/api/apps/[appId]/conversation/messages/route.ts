import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getActor } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { appendUserMessage, findMessageByJobId } from "@/lib/repositories/conversations";
import { listAttachmentsForMessage, type SafeAttachment } from "@/lib/repositories/attachments";
import { enqueueModificationJob, getModificationJobByIdempotencyKey } from "@/lib/repositories/modificationJobs";
import { validateSelectionContext } from "@/lib/modification/selectionContext";
import { SendMessageBody } from "@/lib/validation/conversations";
import { errorResponse, unauthorized } from "@/lib/http/errors";
import { nudgeModificationWorker } from "@/lib/server/queue";
import { correlationIdFrom, withCorrelationId } from "@/lib/observability/correlation";

interface RouteParams {
  params: Promise<{ appId: string }>;
}

/**
 * What the modification pipeline receives as the user's request. Normally
 * just the typed text. An attachment-only message (allowed by the M13
 * composer contract: "send enabled when text or at least one ready
 * attachment exists") has no text to send, so the pipeline instead receives
 * a factual manifest of what was attached — a description of the evidence
 * that exists, never an invented instruction. Slice D replaces this bridge
 * with real multimodal input: the model will see the image/extracted text
 * itself rather than only its filename.
 */
function requestTextFor(content: string, attachments: SafeAttachment[]): string {
  const trimmed = content.trim();
  if (trimmed) return trimmed;
  const manifest = attachments.map((a) => `${a.originalFilename} (${a.detectedMimeType ?? a.declaredMimeType})`).join(", ");
  return `The user sent these attachments with no accompanying text: ${manifest}.`;
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
    console.error(
      "[conversation/messages] 400 validation failed. raw=",
      JSON.stringify(raw),
      "issues=",
      JSON.stringify(parsed.error.issues),
    );
    return NextResponse.json({ error: "Invalid message." }, { status: 400 });
  }
  const { content, baseVersionNumber, selectionContext, attachmentIds, idempotencyKey } = parsed.data;
  const key = idempotencyKey ?? randomUUID();
  const correlationId = correlationIdFrom(request);

  try {
    const db = getDb();

    const existingJob = await getModificationJobByIdempotencyKey(db, actor, appId, key);
    if (existingJob) {
      const message = await findMessageByJobId(db, appId, existingJob.id);
      const attachments = message ? await listAttachmentsForMessage(db, actor, appId, message.id) : [];
      // The ORIGINAL job's correlation id, not this retry's — the retry is
      // the same request, and reporting a fresh id would split one thread
      // in two for whoever reads the events later.
      return withCorrelationId(
        NextResponse.json({ message, job: existingJob, attachments }),
        existingJob.correlationId ?? correlationId,
      );
    }

    const validatedSelection = await validateSelectionContext(db, appId, selectionContext ?? null);

    // The message and its attachment claims share ONE transaction: a claim
    // that fails (not ready, already claimed, someone else's upload,
    // quarantined) must take the message down with it rather than persist a
    // message whose evidence silently disappeared.
    const { message, attachments } = await appendUserMessage(db, actor, appId, {
      content,
      selectionContext: validatedSelection,
      baseVersionNumber,
      attachmentIds,
    });

    const job = await enqueueModificationJob(db, actor, appId, {
      conversationId: message.conversationId,
      triggeringMessageId: message.id,
      userRequestText: requestTextFor(content, attachments),
      selectionContext: validatedSelection,
      idempotencyKey: key,
      correlationId,
    });
    await nudgeModificationWorker(job.id, { cause: "enqueue" });

    return withCorrelationId(NextResponse.json({ message, job, attachments }, { status: 201 }), correlationId);
  } catch (err) {
    return withCorrelationId(errorResponse(err), correlationId);
  }
}

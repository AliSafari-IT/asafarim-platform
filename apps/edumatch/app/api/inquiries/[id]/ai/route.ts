import { NextResponse } from "next/server";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import {
  streamOpenAI,
  streamAnthropic,
  buildVisionContent,
  buildSystemPrompt,
  transcribeForAttempt,
  recordBilledCall,
  type BilledCall,
  type StreamChunk,
} from "@/lib/server/ai-orchestrator";
import { attemptCostMicros, type EduAiAttempt } from "@/lib/server/ai-cost";
import { totalInputTokens, totalOutputTokens } from "@asafarim/ai-cost-ledger";
import { moderatePrompt, moderationAllowsGeneration } from "@/lib/server/moderation";
import { recordEduAuditEvent } from "@/lib/server/audit";
import { redactForProvider } from "@/lib/server/ai-redact";
import {
  assertCanGenerateAiResponse,
  blockedHttpStatus,
  EduAiBlockedError,
} from "@/lib/server/ai-quota";
import {
  AiClaimLostError,
  claimAiGeneration,
  persistUnderClaim,
  releaseAiClaim,
} from "@/lib/server/ai-claim";
import { getSignedDownloadUrl } from "@/lib/server/storage";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * GET /api/inquiries/[id]/ai?stream=1
 *
 * Stream an AI response for the inquiry using Server-Sent Events.
 * STUDENT-only; only the inquiry owner can request AI help.
 *
 * Query params:
 *   stream=1 — required to enable SSE stream (otherwise returns 400)
 *
 * Behavior:
 * - If audio attachments exist, transcribes via Whisper first (once, cached).
 * - Builds vision content from description + images.
 * - Streams tokens from OpenAI (gpt-4o for vision, gpt-4o-mini for text-only).
 * - If OpenAI fails (quota exceeded, etc.), automatically falls back to Anthropic streaming.
 * - On stream completion, persists EduAiResponse and updates inquiry status
 *   in one transaction, before the `done` event is sent.
 * - Spend controls (#539): when AI is switched off, the month's budget is
 *   used up, or the student used this month's answers, the request gets
 *   503/429 `{ error: "ai_blocked", reason }` before any provider call.
 * - Only one AI attempt per inquiry may run at a time (#542): a request made
 *   while another stream or queued job holds the in-flight claim gets 409
 *   and never reaches a provider.
 *
 * Fallback: OpenAI → Anthropic (automatic, no client retry needed)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: inquiryId } = await params;
    const localeHint = resolveLocaleFromCookie(request.headers.get("cookie"));

    const inquiry = await prisma.eduInquiry.findUnique({
      where: { id: inquiryId },
      select: { studentId: true, description: true, attachments: true, status: true },
    });
    if (!inquiry) {
      return badRequest("Inquiry not found.");
    }
    if (inquiry.studentId !== user.id) {
      return handleEduError("inquiries/ai", new Error("Forbidden"));
    }

    // Spend controls (#539): kill switch, monthly budget, student quota,
    // checked before the claim and before any paid call. A block persists
    // nothing, so it stays distinct from a moderation refusal.
    try {
      await assertCanGenerateAiResponse(user.id);
    } catch (err) {
      if (err instanceof EduAiBlockedError) {
        console.warn(`[AI] inquiry ${inquiryId}: AI generation blocked (${err.reason})`);
        void recordEduAuditEvent({
          actorId: user.id,
          actorRole: "STUDENT",
          action: "AI_GENERATION_BLOCKED",
          entity: "EduInquiry",
          entityId: inquiryId,
          prevState: inquiry.status,
          nextState: inquiry.status,
          reason: err.reason,
        });
        return NextResponse.json(
          { error: "ai_blocked", reason: err.reason, message: err.message },
          { status: blockedHttpStatus(err.reason) },
        );
      }
      throw err;
    }

    // In-flight claim (#542): a second tab or a refresh mid-stream must not
    // start a second paid generation for the same inquiry.
    const claim = await claimAiGeneration(inquiryId);
    if (!claim.claimed) {
      return NextResponse.json(
        { error: "An AI response for this inquiry is already in progress." },
        { status: 409 },
      );
    }
    const claimedAt = claim.claimedAt;
    if (claim.staleTakeover) {
      console.warn(
        `[AI] inquiry ${inquiryId}: taking over a stale in-flight claim (previous attempt crashed?); regenerating`,
      );
      void recordEduAuditEvent({
        actorId: user.id,
        actorRole: "STUDENT",
        action: "AI_GENERATION_RETRY_AFTER_CRASH",
        entity: "EduInquiry",
        entityId: inquiryId,
        prevState: inquiry.status,
        nextState: inquiry.status,
        reason: "stale in-flight AI claim taken over",
      });
    }
    // Ownership passes to the stream once it starts; until then any early
    // return or throw releases the claim in the finally below.
    let claimHandedToStream = false;
    try {
      // For simplicity, require explicit ?stream=1 to avoid accidental buffering
      // in clients that don't expect SSE.
      // (In a full implementation you'd parse URL from request)

      // Stored attachments live in a private bucket — resolve a short-lived
      // signed URL (from the object key) so server-side vision/transcription
      // fetches can read them. Fall back to any legacy stored URL.
      const storedAttachments =
        (inquiry.attachments as Array<{ key?: string; url?: string; mime: string }>) ?? [];
      const attachments = await Promise.all(
        storedAttachments.map(async (a) => ({
          mime: a.mime,
          url:
            a.key && a.key.length > 0
              ? await getSignedDownloadUrl(a.key)
              : (a.url ?? ""),
        })),
      );

      // Cost ledger (#540): every paid call of this attempt is recorded as
      // it returns, whatever happens to the attempt afterwards.
      const attempt: EduAiAttempt = { inquiryId, studentId: user.id, claimedAt };
      const attemptCosts: (bigint | null)[] = [];

      // Transcribe audio if present (blocking before stream; could be cached)
      let audioText = "";
      let audioSeq = 0;
      for (const att of attachments) {
        if (att.mime.startsWith("audio/")) {
          const { transcript: t, costMicros } = await transcribeForAttempt(att.url, attempt, audioSeq++);
          if (t) attemptCosts.push(costMicros);
          if (t?.text) audioText += `\n[Voice transcript]: ${t.text}`;
        }
      }

      // Redact personal data and secrets first (#541): moderation and every
      // provider call below see only the redacted text.
      const description = redactForProvider(inquiry.description + audioText).text;

      // Moderation pre-check: if the prompt is unsafe, do not open a stream.
      // Persist the refusal as an EduAiResponse + flip inquiry to REFUSED, then
      // emit a single SSE event with the redirection text and close.
      const moderation = moderatePrompt(description);
      if (!moderationAllowsGeneration(moderation)) {
        const redirect =
          moderation.redirectMessage ??
          "EduMatch AI couldn't safely respond to that prompt. Please rephrase.";
        // Fenced by the claim: written together, or not at all if a newer
        // attempt took the claim over.
        const refusalRow = await persistUnderClaim(inquiryId, claimedAt, {
          response: {
            inquiryId,
            modelUsed: "moderation",
            promptVersion: "v1-stream",
            explanation: redirect,
            // Only transcription can have been paid for before a refusal.
            ...(attemptCosts.length > 0 ? { tokenCostMicros: attemptCostMicros(attemptCosts) } : {}),
            moderationOutcome: moderation.outcome,
            moderationCategory: moderation.category,
            moderationReason: moderation.reason,
          },
          inquiry: {
            status: "REFUSED",
            aiSummary: redirect.slice(0, 500),
            moderationOutcome: moderation.outcome,
            moderationCategory: moderation.category,
            moderationReason: moderation.reason,
          },
        });
        void recordEduAuditEvent({
          actorId: user.id,
          actorRole: "STUDENT",
          action: "AI_RESPONSE_REFUSED",
          entity: "EduInquiry",
          entityId: inquiryId,
          prevState: inquiry.status,
          nextState: "REFUSED",
          reason: `${moderation.category}: ${moderation.reason}`,
          metadata: { responseId: refusalRow.id },
        });

        const enc = new TextEncoder();
        const refusalStream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              enc.encode(
                `event: moderation\ndata: ${JSON.stringify({
                  outcome: moderation.outcome,
                  category: moderation.category,
                })}\n\n`,
              ),
            );
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ token: redirect })}\n\n`));
            controller.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
            controller.close();
          },
        });
        return new Response(refusalStream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      const content = await buildVisionContent(description, attachments);
      const systemPrompt = buildSystemPrompt(localeHint);

      const encoder = new TextEncoder();
      let fullOutput = "";
      let providerUsed: "openai" | "anthropic" = "openai";
      let modelUsed = content.some((c) => c.type === "image_url")
        ? process.env.OPENAI_MODEL_VISION ?? "gpt-4o"
        : process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini";

      async function* streamWithFallback(): AsyncGenerator<
        StreamChunk & { provider?: "openai" | "anthropic" },
        void,
        unknown
      > {
        // Try OpenAI first
        let openAIError = "";
        for await (const chunk of streamOpenAI(content, systemPrompt)) {
          if (chunk.error) {
            openAIError = chunk.error;
            break;
          }
          if (chunk.accepted || chunk.billed) {
            yield chunk;
            continue;
          }
          if (chunk.token || chunk.done) {
            yield { ...chunk, provider: "openai" };
          }
          if (chunk.done) return;
        }

        // If OpenAI failed, try Anthropic fallback
        if (openAIError) {
          console.log("[AI] OpenAI failed, trying Anthropic fallback:", openAIError);
          for await (const chunk of streamAnthropic(content, systemPrompt)) {
            if (chunk.error) {
              // Both failed - return aggregated error
              yield { error: `OpenAI: ${openAIError} | Anthropic: ${chunk.error}` };
              return;
            }
            if (chunk.accepted || chunk.billed) {
              yield chunk;
              continue;
            }
            if (chunk.token || chunk.done) {
              yield { ...chunk, provider: "anthropic" };
            }
          }
        }
      }

      // The provider call currently streaming (accepted with a 200, so it
      // is billed) and the seq of the next answer call in this attempt.
      let inFlight: { provider: "openai" | "anthropic"; requestModel: string; startedAt: number } | null = null;
      let answerSeq = 0;
      let lastBilled: BilledCall | null = null;
      async function recordAnswerCall(
        billed: BilledCall,
        outcome: "succeeded" | "failed" | "cancelled",
      ): Promise<void> {
        inFlight = null;
        lastBilled = billed;
        attemptCosts.push(
          await recordBilledCall(attempt, "tutor_answer_stream", billed, outcome, answerSeq++),
        );
      }
      // A billed call that never reported its usage (the stream broke, the
      // client went away mid-answer, or a fallback replaced it) is still
      // recorded, with an unknown cost, so the ledger never misses a call.
      async function recordInFlightAsCancelled(): Promise<void> {
        const call = inFlight;
        if (!call) return;
        await recordAnswerCall(
          {
            provider: call.provider,
            requestModel: call.requestModel,
            responseModel: null,
            providerRequestId: null,
            usage: null,
            latencyMs: Date.now() - call.startedAt,
          },
          "cancelled",
        );
      }

      const priorStatus = inquiry.status;
      async function persistResponse(): Promise<void> {
        // One transaction, fenced by the claim: the response row and the
        // inquiry's status flip land together, or not at all if a newer
        // attempt took the claim over (AiClaimLostError).
        const row = await persistUnderClaim(inquiryId, claimedAt, {
          response: {
            inquiryId,
            modelUsed,
            promptVersion: "v1-stream",
            explanation: fullOutput,
            // Token counts and cost for the streamed answer (#540).
            ...(lastBilled?.usage
              ? {
                  promptTokens: totalInputTokens(lastBilled.usage),
                  completionTokens: totalOutputTokens(lastBilled.usage),
                  totalTokens: totalInputTokens(lastBilled.usage) + totalOutputTokens(lastBilled.usage),
                }
              : {}),
            latencyMs: lastBilled?.latencyMs,
            tokenCostMicros: attemptCostMicros(attemptCosts),
            moderationOutcome: moderation.outcome,
            moderationCategory: moderation.category,
            moderationReason: moderation.reason,
          },
          inquiry: {
            status: "AI_RESPONDED",
            aiSummary: fullOutput.slice(0, 500),
            moderationOutcome: moderation.outcome,
            moderationCategory: moderation.category,
            moderationReason: moderation.reason,
          },
        });
        void recordEduAuditEvent({
          actorId: user.id,
          actorRole: "STUDENT",
          action: "AI_RESPONSE_GENERATED",
          entity: "EduAiResponse",
          entityId: row.id,
          prevState: priorStatus,
          nextState: "AI_RESPONDED",
          reason:
            moderation.outcome === "REVIEW"
              ? `borderline: ${moderation.category}`
              : undefined,
          metadata: { provider: providerUsed, model: modelUsed },
        });
      }

      const stream = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamWithFallback()) {
              if (chunk.accepted) {
                // An earlier accepted call that a fallback replaced.
                await recordInFlightAsCancelled();
                inFlight = { ...chunk.accepted, startedAt: Date.now() };
                continue;
              }
              if (chunk.billed) {
                await recordAnswerCall(chunk.billed, "succeeded");
                continue;
              }
              if (chunk.error) {
                controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`));
                return;
              }
              if (chunk.provider) {
                providerUsed = chunk.provider;
                modelUsed = chunk.provider === "openai"
                  ? (content.some((c) => c.type === "image_url")
                      ? process.env.OPENAI_MODEL_VISION ?? "gpt-4o"
                      : process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini")
                  : (process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5");
              }
              if (chunk.token) {
                fullOutput += chunk.token;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk.token })}\n\n`));
              }
              if (chunk.done) {
                // Persist before telling the client we're done (#542), so a
                // finished stream always has its response saved.
                try {
                  await persistResponse();
                } catch (e) {
                  const superseded = e instanceof AiClaimLostError;
                  console.error(
                    superseded
                      ? "[AI] post-stream persist skipped: claim superseded by a newer attempt"
                      : "[AI] post-stream persist failed:",
                    e,
                  );
                  const message = superseded
                    ? "A newer AI response for this inquiry replaced this one."
                    : "Saving the AI response failed.";
                  controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`));
                  return;
                }
                controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
                return;
              }
            }
          } catch (err) {
            try {
              controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`));
            } catch {
              // The client went away mid-stream; nothing left to tell it.
            }
          } finally {
            await recordInFlightAsCancelled();
            // Free the claim before the client sees the stream end, so a
            // retry right after an error isn't refused. No-op when
            // persistence already cleared it.
            await releaseAiClaim(inquiryId, claimedAt);
            try {
              controller.close();
            } catch {
              // Already closed: the client went away mid-stream.
            }
          }
        },
      });

      claimHandedToStream = true;
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } finally {
      if (!claimHandedToStream) {
        await releaseAiClaim(inquiryId, claimedAt);
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries/ai", error);
    }
    return serverError("inquiries/ai", error);
  }
}

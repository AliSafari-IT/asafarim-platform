import { NextResponse } from "next/server";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { streamOpenAI, streamAnthropic, buildVisionContent, buildSystemPrompt, transcribeAudio } from "@/lib/server/ai-orchestrator";
import { moderatePrompt, moderationAllowsGeneration } from "@/lib/server/moderation";
import { recordEduAuditEvent } from "@/lib/server/audit";
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
 * - On stream completion, persists EduAiResponse and updates inquiry status.
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

    // Transcribe audio if present (blocking before stream; could be cached)
    let audioText = "";
    for (const att of attachments) {
      if (att.mime.startsWith("audio/")) {
        const t = await transcribeAudio(att.url);
        if (t?.text) audioText += `\n[Voice transcript]: ${t.text}`;
      }
    }

    const description = inquiry.description + audioText;

    // Moderation pre-check: if the prompt is unsafe, do not open a stream.
    // Persist the refusal as an EduAiResponse + flip inquiry to REFUSED, then
    // emit a single SSE event with the redirection text and close.
    const moderation = moderatePrompt(description);
    if (!moderationAllowsGeneration(moderation)) {
      const redirect =
        moderation.redirectMessage ??
        "EduMatch AI couldn't safely respond to that prompt. Please rephrase.";
      const refusalRow = await prisma.eduAiResponse.create({
        data: {
          inquiryId,
          modelUsed: "moderation",
          promptVersion: "v1-stream",
          explanation: redirect,
          moderationOutcome: moderation.outcome,
          moderationCategory: moderation.category,
          moderationReason: moderation.reason,
        },
        select: { id: true },
      });
      await prisma.eduInquiry.update({
        where: { id: inquiryId },
        data: {
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
      { token?: string; done?: boolean; error?: string; provider?: "openai" | "anthropic" },
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
          if (chunk.token || chunk.done) {
            yield { ...chunk, provider: "anthropic" };
          }
        }
      }
    }

    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamWithFallback()) {
            if (chunk.error) {
              controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`));
              controller.close();
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
              controller.enqueue(encoder.encode(`event: done\ndata: {}\n\n`));
              controller.close();

              // Persist after stream closes (fire-and-forget; log on error)
              prisma.eduAiResponse
                .create({
                  data: {
                    inquiryId,
                    modelUsed,
                    promptVersion: "v1-stream",
                    explanation: fullOutput,
                    moderationOutcome: moderation.outcome,
                    moderationCategory: moderation.category,
                    moderationReason: moderation.reason,
                  },
                  select: { id: true },
                })
                .then((row) =>
                  prisma.eduInquiry
                    .update({
                      where: { id: inquiryId },
                      data: {
                        status: "AI_RESPONDED",
                        aiSummary: fullOutput.slice(0, 500),
                        moderationOutcome: moderation.outcome,
                        moderationCategory: moderation.category,
                        moderationReason: moderation.reason,
                      },
                    })
                    .then(() =>
                      recordEduAuditEvent({
                        actorId: user.id,
                        actorRole: "STUDENT",
                        action: "AI_RESPONSE_GENERATED",
                        entity: "EduAiResponse",
                        entityId: row.id,
                        prevState: inquiry.status,
                        nextState: "AI_RESPONDED",
                        reason:
                          moderation.outcome === "REVIEW"
                            ? `borderline: ${moderation.category}`
                            : undefined,
                        metadata: { provider: providerUsed, model: modelUsed },
                      }),
                    ),
                )
                .catch((e) => console.error("[AI] post-stream persist failed:", e));
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(err) })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries/ai", error);
    }
    return serverError("inquiries/ai", error);
  }
}

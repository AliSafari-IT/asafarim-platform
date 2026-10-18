/**
 * Phase 2.2 — AI orchestrator for EduMatch.
 *
 * Capabilities:
 * - Vision: GPT-4o Vision for homework photos (images up to 20MB)
 * - Audio: OpenAI Whisper for voice questions (transcription → text)
 * - Streaming: Server-Sent Events for real-time AI response
 * - Fallback: OpenAI primary → Anthropic failover
 *
 * Environment:
 *   OPENAI_API_KEY          required for primary
 *   OPENAI_MODEL_VISION     default "gpt-4o"
 *   OPENAI_MODEL_CHAT       default "gpt-4o-mini"
 *   ANTHROPIC_API_KEY       required for fallback
 *   ANTHROPIC_MODEL         default "claude-haiku-4-5"
 */

import { prisma } from "@asafarim/db";
import { toBaseLanguage, type BaseLanguage } from "@asafarim/shared-i18n";
import { objectExists } from "./storage";
import {
  moderatePrompt,
  moderationAllowsGeneration,
  type ModerationDecision,
} from "./moderation";
import { recordEduAuditEvent } from "./audit";
import { redactForProvider } from "./ai-redact";
import {
  attemptCostMicros,
  recordEduAiCost,
  safeAnthropicUsage,
  safeOpenAiUsage,
  transcriptionUsage,
  type EduAiAttempt,
  type EduCostOperation,
} from "./ai-cost";
import type { UsageLine } from "@asafarim/ai-cost-ledger";
import {
  AiClaimLostError,
  claimAiGeneration,
  persistUnderClaim,
  releaseAiClaim,
} from "./ai-claim";

/** Inquiry states after which a redelivered queued job must not regenerate. */
const TERMINAL_AI_STATUSES: readonly string[] = ["AI_RESPONDED", "REFUSED"];

const OPENAI_VISION_MODEL = process.env.OPENAI_MODEL_VISION ?? "gpt-4o";
const OPENAI_CHAT_MODEL = process.env.OPENAI_MODEL_CHAT ?? "gpt-4o-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-haiku-4-5";

const OPENAI_MAX_TOKENS = parseInt(process.env.OPENAI_MAX_TOKENS ?? "4000", 10);
const ANTHROPIC_MAX_TOKENS = parseInt(
  process.env.ANTHROPIC_MAX_TOKENS ?? "4000",
  10,
);

export type VisionContent =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type TranscriptionResult = {
  text: string;
  duration?: number;
  language?: string;
  latencyMs?: number;
};

/**
 * A provider call that returned 200, so it is billed even when its output
 * turned out unusable (#540). Recorded as one cost event by the caller.
 */
export type BilledCall = {
  provider: "openai" | "anthropic";
  requestModel: string;
  /** The model id the provider reported (often dated, e.g. gpt-4o-2024-08-06). */
  responseModel: string | null;
  providerRequestId: string | null;
  /** null when the provider returned no usage block: the cost is unknown. */
  usage: UsageLine[] | null;
  latencyMs: number;
};

export type AiResponseSuccess = {
  output: string;
  provider: "openai" | "anthropic";
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  truncated?: boolean;
  stopReason?: string;
  latencyMs: number;
  billed?: BilledCall;
};

export type AiResponseFailure = { error: string; billed?: BilledCall };
export type AiResponseResult = AiResponseSuccess | AiResponseFailure;

function getProviderError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("error" in payload))
    return undefined;
  const err = (payload as { error?: { message?: string } }).error;
  return typeof err?.message === "string" ? err.message : undefined;
}

/**
 * Transcribe audio using OpenAI Whisper.
 * Returns the transcript text or null if audio service unavailable.
 */
export async function transcribeAudio(
  audioUrl: string,
): Promise<TranscriptionResult | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  // Whisper requires a file upload; we stream from the provided URL.
  const audioRes = await fetch(audioUrl);
  if (!audioRes.ok) return null;

  const blob = await audioRes.blob();
  const form = new FormData();
  form.append(
    "file",
    new File([blob], "voice.webm", { type: "audio/webm" }),
    "voice.webm",
  );
  form.append("model", "whisper-1");
  // verbose_json carries the audio duration, which is what Whisper bills.
  form.append("response_format", "verbose_json");

  const start = Date.now();
  const upstream = await fetch(
    "https://api.openai.com/v1/audio/transcriptions",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    },
  );

  const payload = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    console.error("[Whisper] failed:", getProviderError(payload) ?? "unknown");
    return null;
  }
  const data = payload as {
    text?: string;
    duration?: number;
    language?: string;
  };
  return {
    text: typeof data.text === "string" ? data.text : "",
    duration: typeof data.duration === "number" ? data.duration : undefined,
    language: typeof data.language === "string" ? data.language : undefined,
    latencyMs: Date.now() - start,
  };
}

/**
 * Transcribe one audio attachment and record its Whisper cost against the
 * attempt (#540). A transcription without a duration is recorded with an
 * unknown cost. Returns the transcript (or null) and the recorded estimate.
 */
export async function transcribeForAttempt(
  audioUrl: string,
  attempt: EduAiAttempt,
  seq: number,
): Promise<{ transcript: TranscriptionResult | null; costMicros: bigint | null }> {
  const transcript = await transcribeAudio(audioUrl);
  if (!transcript) return { transcript: null, costMicros: null };
  const recorded = await recordEduAiCost({
    attempt,
    operation: "transcription",
    seq,
    provider: "openai",
    requestModel: "whisper-1",
    usage:
      typeof transcript.duration === "number"
        ? transcriptionUsage(transcript.duration)
        : null,
    latencyMs: transcript.latencyMs ?? null,
  });
  return { transcript, costMicros: recorded.estimatedCostMicros };
}

/** Record the cost of one billed answer call; returns the estimate (null = unknown). */
export async function recordBilledCall(
  attempt: EduAiAttempt,
  operation: EduCostOperation,
  billed: BilledCall,
  outcome: "succeeded" | "failed" | "cancelled",
  seq = 0,
): Promise<bigint | null> {
  const recorded = await recordEduAiCost({
    attempt,
    operation,
    seq,
    provider: billed.provider,
    requestModel: billed.requestModel,
    responseModel: billed.responseModel,
    providerRequestId: billed.providerRequestId,
    promptVersion: operation === "tutor_answer_stream" ? "v1-stream" : "v1",
    usage: billed.usage,
    outcome,
    latencyMs: billed.latencyMs,
  });
  return recorded.estimatedCostMicros;
}

/**
 * Build the vision+text content array for GPT-4o from inquiry attachments.
 * Only includes image URLs that actually exist in storage (HEAD check).
 * Falls back to text-only if no valid images.
 */
export async function buildVisionContent(
  description: string,
  attachments: Array<{ url: string; mime: string }>,
): Promise<VisionContent[]> {
  const content: VisionContent[] = [{ type: "text", text: description }];

  const imageUrls: string[] = [];
  for (const att of attachments) {
    if (!att.mime.startsWith("image/")) continue;
    const exists = await objectExists(att.url); // HEAD check
    if (exists) imageUrls.push(att.url);
  }

  // Limit to first 4 images (OpenAI cap for gpt-4o).
  for (const url of imageUrls.slice(0, 4)) {
    content.push({ type: "image_url", image_url: { url } });
  }

  return content;
}

/**
 * Generate AI response via OpenAI (primary).
 * Supports vision when images are provided.
 */
export async function generateWithOpenAI(
  content: VisionContent[],
  systemPrompt: string,
): Promise<AiResponseResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "OPENAI_API_KEY not configured." };

  const hasImages = content.some((c) => c.type === "image_url");
  const model = hasImages ? OPENAI_VISION_MODEL : OPENAI_CHAT_MODEL;

  const start = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: OPENAI_MAX_TOKENS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content },
        ],
      }),
    });
  } catch (error) {
    console.error("[AI] OpenAI request failed:", error);
    return { error: "OpenAI request failed." };
  }
  const latencyMs = Date.now() - start;

  const payload = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const error = getProviderError(payload) ?? `OpenAI ${upstream.status}`;
    console.error(`[AI] OpenAI ${upstream.status}:`, error);
    return { error };
  }

  const data = payload as {
    id?: string;
    model?: string;
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
      prompt_tokens_details?: { cached_tokens?: number } | null;
      completion_tokens_details?: { reasoning_tokens?: number } | null;
    };
  };
  const billed: BilledCall = {
    provider: "openai",
    requestModel: model,
    responseModel: typeof data.model === "string" ? data.model : null,
    providerRequestId: typeof data.id === "string" ? data.id : null,
    usage: safeOpenAiUsage(data.usage),
    latencyMs,
  };
  const choice = data.choices?.[0];
  const output = choice?.message?.content?.trim();
  if (!output) return { error: "OpenAI returned empty content.", billed };

  return {
    output,
    provider: "openai",
    model,
    promptTokens: data.usage?.prompt_tokens,
    completionTokens: data.usage?.completion_tokens,
    totalTokens: data.usage?.total_tokens,
    truncated: choice?.finish_reason === "length",
    stopReason: choice?.finish_reason,
    latencyMs,
    billed,
  };
}

/**
 * Generate AI response via Anthropic (fallback).
 * Note: Claude 3.5 Sonnet supports vision, but we map images to a text
 * description stub if strict compatibility is needed. For now we use
 * text-only fallback since vision is OpenAI-primary.
 */
export async function generateWithAnthropic(
  textPrompt: string,
  systemPrompt: string,
): Promise<AiResponseResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY not configured." };

  const start = Date.now();
  let upstream: Response;
  try {
    upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: ANTHROPIC_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: textPrompt }],
      }),
    });
  } catch (error) {
    console.error("[AI] Anthropic request failed:", error);
    return { error: "Anthropic request failed." };
  }
  const latencyMs = Date.now() - start;

  const payload = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    const error = getProviderError(payload) ?? `Anthropic ${upstream.status}`;
    console.error(`[AI] Anthropic ${upstream.status}:`, error);
    return { error };
  }

  const data = payload as {
    id?: string;
    model?: string;
    content?: Array<{ type: string; text?: string }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_read_input_tokens?: number | null;
      cache_creation_input_tokens?: number | null;
    };
    stop_reason?: string;
  };
  const billed: BilledCall = {
    provider: "anthropic",
    requestModel: ANTHROPIC_MODEL,
    responseModel: typeof data.model === "string" ? data.model : null,
    providerRequestId: typeof data.id === "string" ? data.id : null,
    usage: safeAnthropicUsage(data.usage),
    latencyMs,
  };
  const text = data.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) return { error: "Anthropic returned empty content.", billed };

  const promptTokens = data.usage?.input_tokens;
  const completionTokens = data.usage?.output_tokens;
  return {
    output: text,
    provider: "anthropic",
    model: ANTHROPIC_MODEL,
    promptTokens,
    completionTokens,
    totalTokens:
      typeof promptTokens === "number" && typeof completionTokens === "number"
        ? promptTokens + completionTokens
        : undefined,
    truncated: data.stop_reason === "max_tokens",
    stopReason: data.stop_reason,
    latencyMs,
    billed,
  };
}

const LANGUAGE_NAMES: Record<BaseLanguage, string> = {
  en: "English",
  nl: "Dutch",
  fr: "French",
  de: "German",
  lb: "Luxembourgish",
};

/**
 * Build the AI tutor's system prompt.
 *
 * "Answer in the same language as the student question" alone is unreliable
 * for the short, technical inputs this app actually gets — "algebera II" (a
 * real example) gives a language model almost nothing to detect from, and
 * it guessed Spanish for a Dutch-locale student. `localeHint` — the
 * student's app locale, resolved from the `asafarim-lang` cookie by the
 * caller — gives the model a fallback for exactly that case, while still
 * letting an unambiguous question in another language (a French student
 * writing in French while the app happens to be in English) win, since the
 * instruction order asks it to prefer the question's own language when
 * that's actually clear.
 */
export function buildSystemPrompt(localeHint?: string): string {
  const languageLine = localeHint
    ? `- Answer in the same language as the student's question when that language is clearly identifiable from the text. If the question is too short or ambiguous to tell (e.g. a bare technical term or a typo), answer in ${LANGUAGE_NAMES[toBaseLanguage(localeHint)]} instead — that's the language the student's app is set to.`
    : `- Answer in the same language as the student question.`;

  return `You are EduMatch AI, a helpful tutor for students.
Guidelines:
${languageLine}
- Be encouraging and concise; prefer step-by-step explanations.
- If images are provided, read them carefully and reference specific content.
- If a question is unclear, ask clarifying questions.
- Never write exam answers verbatim; guide the student to understanding.
- Cite any formulas or facts you use.`;
}

/**
 * Orchestrate a full AI response for an inquiry.
 * 1) Transcribe any audio attachments via Whisper.
 * 2) Build vision content (description + images).
 * 3) Call OpenAI (vision if images present).
 * 4) Fallback to Anthropic text-only on failure.
 * 5) Persist EduAiResponse row and update inquiry status.
 */
export async function orchestrateResponse(
  inquiryId: string,
  forceProvider?: "openai" | "anthropic",
  options?: { localeHint?: string },
): Promise<AiResponseResult & { responseId?: string }> {
  const inquiry = await prisma.eduInquiry.findUnique({
    where: { id: inquiryId },
    include: { aiResponses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!inquiry) return { error: "Inquiry not found." };

  // Idempotency guard: this function is only ever invoked as a BullMQ job
  // processor (see ai-worker.ts), and the enqueue route already refuses to
  // queue a second job once an inquiry reaches AI_RESPONDED/REFUSED. The one
  // case that guard can't catch is BullMQ redelivering the *same* job after
  // it already completed (stalled-job recovery, or a manual retry from a
  // queue UI) — without this check, that redelivery would call the paid AI
  // providers again and append a second EduAiResponse row. Reuse the
  // already-fetched latest response instead of regenerating.
  if (TERMINAL_AI_STATUSES.includes(inquiry.status) && inquiry.aiResponses[0]) {
    const latest = inquiry.aiResponses[0];
    return {
      output: latest.explanation,
      provider: latest.modelUsed.includes("claude") ? "anthropic" : "openai",
      model: latest.modelUsed,
      promptTokens: latest.promptTokens ?? undefined,
      completionTokens: latest.completionTokens ?? undefined,
      totalTokens: latest.totalTokens ?? undefined,
      latencyMs: latest.latencyMs ?? 0,
      responseId: latest.id,
    };
  }

  // In-flight claim (#542): only one attempt per inquiry may reach a paid
  // provider. The terminal-state filter closes the gap between the check
  // above and the claim, where another attempt could have just finished.
  const claim = await claimAiGeneration(inquiryId, {
    excludeStatuses: TERMINAL_AI_STATUSES,
  });
  if (!claim.claimed) {
    console.warn(
      `[AI] inquiry ${inquiryId}: another AI attempt is in flight or already finished; skipping provider call`,
    );
    return { error: "AI generation is already in progress for this inquiry." };
  }
  if (claim.staleTakeover) {
    // A previous attempt claimed this inquiry and never finished: most likely
    // a crash after (or during) a paid provider call. Proceed, but flag it so
    // a second charge for the same inquiry is never silent.
    console.warn(
      `[AI] inquiry ${inquiryId}: taking over a stale in-flight claim (previous attempt crashed?); regenerating`,
    );
    await recordEduAuditEvent({
      actorId: inquiry.studentId,
      actorRole: "SYSTEM",
      action: "AI_GENERATION_RETRY_AFTER_CRASH",
      entity: "EduInquiry",
      entityId: inquiryId,
      prevState: inquiry.status,
      nextState: inquiry.status,
      reason: "stale in-flight AI claim taken over",
    });
  }

  try {
    return await generateClaimed(inquiry, claim.claimedAt, forceProvider, options);
  } catch (err) {
    if (err instanceof AiClaimLostError) {
      // A newer attempt took the claim over while this one was still
      // generating; its result wins, so this one writes nothing.
      console.warn(`[AI] inquiry ${inquiryId}: ${err.message}; discarding this attempt's result`);
      return { error: "AI generation was superseded by a newer attempt." };
    }
    throw err;
  } finally {
    // No-op when persistence already cleared the claim.
    await releaseAiClaim(inquiryId, claim.claimedAt);
  }
}

type ClaimedInquiry = {
  id: string;
  studentId: string;
  status: string;
  description: string;
  attachments: unknown;
};

async function generateClaimed(
  inquiry: ClaimedInquiry,
  claimedAt: Date,
  forceProvider: "openai" | "anthropic" | undefined,
  options: { localeHint?: string } | undefined,
): Promise<AiResponseResult & { responseId?: string }> {
  const inquiryId = inquiry.id;
  const attachments =
    (inquiry.attachments as Array<{ url: string; mime: string }>) ?? [];
  // Cost ledger (#540): every paid call of this attempt is recorded as it
  // returns, whatever happens to the attempt afterwards.
  const attempt: EduAiAttempt = {
    inquiryId,
    studentId: inquiry.studentId,
    claimedAt,
  };
  const attemptCosts: (bigint | null)[] = [];

  // 1) Transcribe audio (optional)
  let audioText = "";
  let audioSeq = 0;
  for (const att of attachments) {
    if (att.mime.startsWith("audio/")) {
      const { transcript: t, costMicros } = await transcribeForAttempt(
        att.url,
        attempt,
        audioSeq++,
      );
      if (t) attemptCosts.push(costMicros);
      if (t?.text) audioText += `\\n[Voice transcript]: ${t.text}`;
    }
  }

  // 2) Build prompt. Redact personal data and secrets first (#541): from
  // here on, moderation and every provider call see only the redacted text.
  const baseDescription = redactForProvider(inquiry.description + audioText).text;
  const systemPrompt = buildSystemPrompt(options?.localeHint);

  // 2a) Moderation pre-check. If REFUSE, short-circuit and persist a
  // refusal-only EduAiResponse + update inquiry without ever calling the
  // provider. The student-facing redirection message is what gets stored.
  const moderation: ModerationDecision = moderatePrompt(baseDescription);
  if (!moderationAllowsGeneration(moderation)) {
    const refusalOutput =
      moderation.redirectMessage ??
      "EduMatch AI couldn't safely respond to that prompt. Please rephrase.";

    // One transaction, fenced by the claim (#542): the refusal row and the
    // inquiry's new status land together, or not at all if a newer attempt
    // took the claim over.
    const refusalRow = await persistUnderClaim(inquiryId, claimedAt, {
      response: {
        inquiryId,
        modelUsed: "moderation",
        promptVersion: "v1",
        // Only transcription can have been paid for before a refusal.
        ...(attemptCosts.length > 0
          ? { tokenCostMicros: attemptCostMicros(attemptCosts) }
          : {}),
        explanation: refusalOutput,
        moderationOutcome: moderation.outcome,
        moderationCategory: moderation.category,
        moderationReason: moderation.reason,
      },
      inquiry: {
        status: "REFUSED",
        aiSummary: refusalOutput.slice(0, 500),
        moderationOutcome: moderation.outcome,
        moderationCategory: moderation.category,
        moderationReason: moderation.reason,
      },
    });

    await recordEduAuditEvent({
      actorId: inquiry.studentId,
      actorRole: "STUDENT",
      action: "AI_RESPONSE_REFUSED",
      entity: "EduInquiry",
      entityId: inquiryId,
      prevState: inquiry.status,
      nextState: "REFUSED",
      reason: `${moderation.category}: ${moderation.reason}`,
    });

    return {
      output: refusalOutput,
      provider: "openai",
      model: "moderation",
      latencyMs: 0,
      responseId: refusalRow.id,
    } as AiResponseResult & { responseId?: string };
  }

  // Try OpenAI first (with vision if images present)
  let result: AiResponseResult;
  const errors: string[] = [];

  if (!forceProvider || forceProvider === "openai") {
    const visionContent = await buildVisionContent(
      baseDescription,
      attachments,
    );
    const openai = await generateWithOpenAI(visionContent, systemPrompt);
    if (openai.billed) {
      attemptCosts.push(
        await recordBilledCall(
          attempt,
          "tutor_answer",
          openai.billed,
          "output" in openai ? "succeeded" : "failed",
        ),
      );
    }
    if ("output" in openai) {
      result = openai;
    } else {
      errors.push(`OpenAI: ${openai.error}`);
      // Fallback to Anthropic
      if (!forceProvider) {
        const anthropic = await generateWithAnthropic(
          baseDescription,
          systemPrompt,
        );
        if (anthropic.billed) {
          attemptCosts.push(
            await recordBilledCall(
              attempt,
              "tutor_answer",
              anthropic.billed,
              "output" in anthropic ? "succeeded" : "failed",
              1,
            ),
          );
        }
        if ("output" in anthropic) {
          result = anthropic;
        } else {
          errors.push(`Anthropic: ${anthropic.error}`);
          result = { error: errors.join(" | ") };
        }
      } else {
        result = openai;
      }
    }
  } else {
    // Force Anthropic
    const anthropic = await generateWithAnthropic(
      baseDescription,
      systemPrompt,
    );
    if (anthropic.billed) {
      attemptCosts.push(
        await recordBilledCall(
          attempt,
          "tutor_answer",
          anthropic.billed,
          "output" in anthropic ? "succeeded" : "failed",
          1,
        ),
      );
    }
    result = anthropic;
  }

  // Persist (with moderation snapshot — ALLOW or REVIEW for non-refused).
  // One transaction, fenced by the claim (#542): the response row and the
  // inquiry update (status on success; in every case the claim is cleared)
  // land together, or not at all if a newer attempt took the claim over.
  const responseRow = await persistUnderClaim(inquiryId, claimedAt, {
    response: {
      inquiryId,
      modelUsed: "error" in result ? "none" : result.model,
      promptVersion: "v1",
      explanation: "error" in result ? "" : result.output,
      latencyMs: "error" in result ? undefined : result.latencyMs,
      promptTokens: "error" in result ? undefined : result.promptTokens,
      completionTokens: "error" in result ? undefined : result.completionTokens,
      totalTokens: "error" in result ? undefined : result.totalTokens,
      // The attempt's whole AI cost (transcription + every answer call);
      // null when any part of it is unknown (#540).
      tokenCostMicros: attemptCostMicros(attemptCosts),
      truncated: "error" in result ? false : result.truncated,
      stopReason: "error" in result ? undefined : result.stopReason,
      moderationOutcome: moderation.outcome,
      moderationCategory: moderation.category,
      moderationReason: moderation.reason,
    },
    inquiry:
      "error" in result
        ? {}
        : {
            status: "AI_RESPONDED",
            aiSummary: result.output.slice(0, 500),
            moderationOutcome: moderation.outcome,
            moderationCategory: moderation.category,
            moderationReason: moderation.reason,
          },
  });

  if (!("error" in result)) {
    await recordEduAuditEvent({
      actorId: inquiry.studentId,
      actorRole: "STUDENT",
      action: "AI_RESPONSE_GENERATED",
      entity: "EduAiResponse",
      entityId: responseRow.id,
      prevState: inquiry.status,
      nextState: "AI_RESPONDED",
      reason:
        moderation.outcome === "REVIEW"
          ? `borderline: ${moderation.category}`
          : undefined,
      metadata: { provider: result.provider, model: result.model },
    });
  }

  return { ...result, responseId: responseRow.id };
}

/**
 * One chunk from a provider stream. `accepted` is yielded once, when the
 * provider answered 200 (from then on the call is billed); `billed` is
 * yielded once, with the final usage, right before `done` (#540).
 */
export type StreamChunk = {
  token?: string;
  done?: boolean;
  error?: string;
  accepted?: { provider: "openai" | "anthropic"; requestModel: string };
  billed?: BilledCall;
};

/**
 * Stream an AI response via Server-Sent Events.
 * Yields partial tokens as they arrive from OpenAI streaming endpoint.
 */
export async function* streamOpenAI(
  content: VisionContent[],
  systemPrompt: string,
): AsyncGenerator<StreamChunk, void, unknown> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    yield { error: "OPENAI_API_KEY not configured.", done: true };
    return;
  }

  const hasImages = content.some((c) => c.type === "image_url");
  const model = hasImages ? OPENAI_VISION_MODEL : OPENAI_CHAT_MODEL;

  const start = Date.now();
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: OPENAI_MAX_TOKENS,
      stream: true,
      // Ask for the usage chunk OpenAI sends after the last content chunk.
      stream_options: { include_usage: true },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content },
      ],
    }),
  });

  if (!upstream.ok) {
    const payload = (await upstream.json().catch(() => ({}))) as unknown;
    yield {
      error: getProviderError(payload) ?? `OpenAI ${upstream.status}`,
      done: true,
    };
    return;
  }

  yield { accepted: { provider: "openai", requestModel: model } };
  const reader = upstream.body?.getReader();
  if (!reader) {
    yield { error: "No response body.", done: true };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  let responseModel: string | null = null;
  let providerRequestId: string | null = null;
  let usage: UsageLine[] | null = null;
  const billed = (): BilledCall => ({
    provider: "openai",
    requestModel: model,
    responseModel,
    providerRequestId,
    usage,
    latencyMs: Date.now() - start,
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const json = trimmed.replace(/^data:\s*/, "");
      if (json === "[DONE]") {
        yield { billed: billed() };
        yield { done: true };
        return;
      }
      try {
        const parsed = JSON.parse(json) as {
          id?: string;
          model?: string;
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string | null;
          }>;
          usage?: Parameters<typeof safeOpenAiUsage>[0];
        };
        if (typeof parsed.id === "string") providerRequestId = parsed.id;
        if (typeof parsed.model === "string") responseModel = parsed.model;
        if (parsed.usage) usage = safeOpenAiUsage(parsed.usage);
        const token = parsed.choices?.[0]?.delta?.content;
        if (token && !finished) yield { token };
        // Keep reading after finish_reason: the usage chunk comes after it.
        if (parsed.choices?.[0]?.finish_reason) finished = true;
      } catch {
        // ignore malformed JSON in stream
      }
    }
  }

  yield { billed: billed() };
  yield { done: true };
}

/**
 * Stream an AI response via Anthropic (fallback for OpenAI streaming failures).
 * Yields partial tokens as they arrive from Anthropic streaming endpoint.
 */
export async function* streamAnthropic(
  content: VisionContent[],
  systemPrompt: string,
): AsyncGenerator<StreamChunk, void, unknown> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    yield { error: "ANTHROPIC_API_KEY not configured.", done: true };
    return;
  }

  // Anthropic only supports text content in streaming, extract text
  const textContent = content
    .map((c) => (c.type === "text" ? c.text : "[Image attached]"))
    .join("\n");

  const start = Date.now();
  const upstream = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: ANTHROPIC_MAX_TOKENS,
      system: systemPrompt,
      messages: [{ role: "user", content: textContent }],
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const payload = (await upstream.json().catch(() => ({}))) as unknown;
    yield {
      error: getProviderError(payload) ?? `Anthropic ${upstream.status}`,
      done: true,
    };
    return;
  }

  yield { accepted: { provider: "anthropic", requestModel: ANTHROPIC_MODEL } };
  const reader = upstream.body?.getReader();
  if (!reader) {
    yield { error: "No response body from Anthropic.", done: true };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let responseModel: string | null = null;
  let providerRequestId: string | null = null;
  // message_start carries the input side, message_delta the running output.
  let usagePayload: Parameters<typeof safeAnthropicUsage>[0] | null = null;
  const billed = (): BilledCall => ({
    provider: "anthropic",
    requestModel: ANTHROPIC_MODEL,
    responseModel,
    providerRequestId,
    usage: safeAnthropicUsage(usagePayload),
    latencyMs: Date.now() - start,
  });

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data:")) continue;
      const json = trimmed.replace(/^data:\s*/, "");
      if (json === "[DONE]") {
        yield { billed: billed() };
        yield { done: true };
        return;
      }
      try {
        const parsed = JSON.parse(json) as {
          type?: string;
          delta?: { text?: string };
          message?: {
            id?: string;
            model?: string;
            usage?: NonNullable<Parameters<typeof safeAnthropicUsage>[0]>;
          };
          usage?: { output_tokens?: number };
        };
        if (parsed.type === "message_start" && parsed.message) {
          if (typeof parsed.message.id === "string") providerRequestId = parsed.message.id;
          if (typeof parsed.message.model === "string") responseModel = parsed.message.model;
          if (parsed.message.usage) usagePayload = { ...parsed.message.usage };
        }
        if (parsed.type === "message_delta" && typeof parsed.usage?.output_tokens === "number") {
          // Cumulative output count for the whole message.
          usagePayload = { ...(usagePayload ?? {}), output_tokens: parsed.usage.output_tokens };
        }
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield { token: parsed.delta.text };
        }
        if (parsed.type === "message_stop") {
          yield { billed: billed() };
          yield { done: true };
          return;
        }
      } catch {
        // ignore malformed JSON in stream
      }
    }
  }

  yield { billed: billed() };
  yield { done: true };
}

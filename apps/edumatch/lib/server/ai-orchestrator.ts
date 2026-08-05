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
import { objectExists } from "./storage";
import {
  moderatePrompt,
  moderationAllowsGeneration,
  type ModerationDecision,
} from "./moderation";
import { recordEduAuditEvent } from "./audit";

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
};

export type AiResponseFailure = { error: string };
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
  form.append("response_format", "json");

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
  };
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
  const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
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
  const latencyMs = Date.now() - start;

  const payload = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    return { error: getProviderError(payload) ?? `OpenAI ${upstream.status}` };
  }

  const data = payload as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };
  const choice = data.choices?.[0];
  const output = choice?.message?.content?.trim();
  if (!output) return { error: "OpenAI returned empty content." };

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
      messages: [{ role: "user", content: textPrompt }],
    }),
  });
  const latencyMs = Date.now() - start;

  const payload = (await upstream.json()) as unknown;
  if (!upstream.ok) {
    return {
      error: getProviderError(payload) ?? `Anthropic ${upstream.status}`,
    };
  }

  const data = payload as {
    content?: Array<{ type: string; text?: string }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };
  const text = data.content?.find((c) => c.type === "text")?.text?.trim();
  if (!text) return { error: "Anthropic returned empty content." };

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
  };
}

const DEFAULT_SYSTEM_PROMPT = `You are EduMatch AI, a helpful tutor for students.
Guidelines:
- Answer in the same language as the student question.
- Be encouraging and concise; prefer step-by-step explanations.
- If images are provided, read them carefully and reference specific content.
- If a question is unclear, ask clarifying questions.
- Never write exam answers verbatim; guide the student to understanding.
- Cite any formulas or facts you use.`;

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
): Promise<AiResponseResult & { responseId?: string }> {
  const inquiry = await prisma.eduInquiry.findUnique({
    where: { id: inquiryId },
    include: { aiResponses: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  if (!inquiry) return { error: "Inquiry not found." };

  const attachments =
    (inquiry.attachments as Array<{ url: string; mime: string }>) ?? [];

  // 1) Transcribe audio (optional)
  let audioText = "";
  for (const att of attachments) {
    if (att.mime.startsWith("audio/")) {
      const t = await transcribeAudio(att.url);
      if (t?.text) audioText += `\\n[Voice transcript]: ${t.text}`;
    }
  }

  // 2) Build prompt
  const baseDescription = inquiry.description + audioText;
  const systemPrompt = DEFAULT_SYSTEM_PROMPT;

  // 2a) Moderation pre-check. If REFUSE, short-circuit and persist a
  // refusal-only EduAiResponse + update inquiry without ever calling the
  // provider. The student-facing redirection message is what gets stored.
  const moderation: ModerationDecision = moderatePrompt(baseDescription);
  if (!moderationAllowsGeneration(moderation)) {
    const refusalOutput =
      moderation.redirectMessage ??
      "EduMatch AI couldn't safely respond to that prompt. Please rephrase.";

    const refusalRow = await prisma.eduAiResponse.create({
      data: {
        inquiryId,
        modelUsed: "moderation",
        promptVersion: "v1",
        explanation: refusalOutput,
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
    if ("output" in anthropic) {
      result = anthropic;
    } else {
      result = anthropic;
    }
  }

  // Persist (with moderation snapshot — ALLOW or REVIEW for non-refused).
  const responseRow = await prisma.eduAiResponse.create({
    data: {
      inquiryId,
      modelUsed: "error" in result ? "none" : result.model,
      promptVersion: "v1",
      explanation: "error" in result ? "" : result.output,
      latencyMs: "error" in result ? undefined : result.latencyMs,
      promptTokens: "error" in result ? undefined : result.promptTokens,
      completionTokens: "error" in result ? undefined : result.completionTokens,
      totalTokens: "error" in result ? undefined : result.totalTokens,
      truncated: "error" in result ? false : result.truncated,
      stopReason: "error" in result ? undefined : result.stopReason,
      moderationOutcome: moderation.outcome,
      moderationCategory: moderation.category,
      moderationReason: moderation.reason,
    },
    select: { id: true },
  });

  // Update inquiry status if successful
  if (!("error" in result)) {
    await prisma.eduInquiry.update({
      where: { id: inquiryId },
      data: {
        status: "AI_RESPONDED",
        aiSummary: result.output.slice(0, 500),
        moderationOutcome: moderation.outcome,
        moderationCategory: moderation.category,
        moderationReason: moderation.reason,
      },
    });

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
 * Stream an AI response via Server-Sent Events.
 * Yields partial tokens as they arrive from OpenAI streaming endpoint.
 */
export async function* streamOpenAI(
  content: VisionContent[],
  systemPrompt: string,
): AsyncGenerator<
  { token?: string; done?: boolean; error?: string },
  void,
  unknown
> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    yield { error: "OPENAI_API_KEY not configured.", done: true };
    return;
  }

  const hasImages = content.some((c) => c.type === "image_url");
  const model = hasImages ? OPENAI_VISION_MODEL : OPENAI_CHAT_MODEL;

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

  const reader = upstream.body?.getReader();
  if (!reader) {
    yield { error: "No response body.", done: true };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

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
        yield { done: true };
        return;
      }
      try {
        const parsed = JSON.parse(json) as {
          choices?: Array<{
            delta?: { content?: string };
            finish_reason?: string;
          }>;
        };
        const token = parsed.choices?.[0]?.delta?.content;
        if (token) yield { token };
        if (parsed.choices?.[0]?.finish_reason) {
          yield { done: true };
          return;
        }
      } catch {
        // ignore malformed JSON in stream
      }
    }
  }

  yield { done: true };
}

/**
 * Stream an AI response via Anthropic (fallback for OpenAI streaming failures).
 * Yields partial tokens as they arrive from Anthropic streaming endpoint.
 */
export async function* streamAnthropic(
  content: VisionContent[],
  systemPrompt: string,
): AsyncGenerator<
  { token?: string; done?: boolean; error?: string },
  void,
  unknown
> {
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

  const reader = upstream.body?.getReader();
  if (!reader) {
    yield { error: "No response body from Anthropic.", done: true };
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";

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
        yield { done: true };
        return;
      }
      try {
        const parsed = JSON.parse(json) as {
          type?: string;
          delta?: { text?: string };
        };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield { token: parsed.delta.text };
        }
        if (parsed.type === "message_stop") {
          yield { done: true };
          return;
        }
      } catch {
        // ignore malformed JSON in stream
      }
    }
  }

  yield { done: true };
}

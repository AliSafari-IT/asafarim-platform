const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";
const ANTHROPIC_MODEL = process.env.ANTHROPIC_API_KEY ? "claude-sonnet-4-5" : "claude-haiku-4-5";

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const OPENAI_MAX_OUTPUT_TOKENS = parsePositiveInt(process.env.OPENAI_MAX_OUTPUT_TOKENS, 4000);
const ANTHROPIC_MAX_TOKENS = parsePositiveInt(process.env.ANTHROPIC_MAX_TOKENS, 4000);

export type ProviderSuccess = {
  output: string;
  provider: "openai" | "anthropic";
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  truncated?: boolean;
  stopReason?: string;
};

export type ProviderFailure = {
  error: string;
};

export type ProviderResult = ProviderSuccess | ProviderFailure;

function extractOpenAIText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof data.output_text === "string" && data.output_text.trim()) {
    return data.output_text.trim();
  }
  const chunks = data.output?.flatMap((item) => item.content ?? []) ?? [];
  const text = chunks
    .filter((c) => c.type === "output_text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return text || null;
}

function extractAnthropicText(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as { content?: Array<{ type?: string; text?: string }> };
  const text = data.content
    ?.filter((c) => c.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
    .trim();
  return text || null;
}

function getProviderError(payload: unknown): string | undefined {
  if (!payload || typeof payload !== "object" || !("error" in payload)) return undefined;
  const err = (payload as { error?: { message?: string } }).error;
  return typeof err?.message === "string" ? err.message : undefined;
}

export async function generateWithOpenAI(
  systemPrompt: string,
  userPrompt: string,
): Promise<ProviderResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { error: "OPENAI_API_KEY is not configured." };

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      max_output_tokens: OPENAI_MAX_OUTPUT_TOKENS,
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user", content: [{ type: "input_text", text: userPrompt }] },
      ],
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "OpenAI request failed.");
    const errorPayload = (() => {
      try {
        return JSON.parse(errorText) as unknown;
      } catch {
        return undefined;
      }
    })();
    return { error: (errorPayload ? getProviderError(errorPayload) : undefined) ?? errorText.slice(0, 500) ?? "OpenAI request failed." };
  }

  const payload = (await upstream.json()) as unknown;
  const output = extractOpenAIText(payload);
  if (!output) return { error: "OpenAI returned an empty response." };

  const data = payload as {
    usage?: { input_tokens?: number; output_tokens?: number; total_tokens?: number };
    status?: string;
    incomplete_details?: { reason?: string };
  };
  const stopReason = data.incomplete_details?.reason ?? data.status;
  const truncated = data.incomplete_details?.reason === "max_output_tokens";
  return {
    output,
    provider: "openai",
    model: OPENAI_MODEL,
    promptTokens: data.usage?.input_tokens,
    completionTokens: data.usage?.output_tokens,
    totalTokens: data.usage?.total_tokens,
    truncated,
    stopReason,
  };
}

export async function generateWithAnthropic(
  systemPrompt: string,
  userPrompt: string,
): Promise<ProviderResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { error: "ANTHROPIC_API_KEY is not configured." };

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
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!upstream.ok) {
    const errorText = await upstream.text().catch(() => "Anthropic request failed.");
    const errorPayload = (() => {
      try {
        return JSON.parse(errorText) as unknown;
      } catch {
        return undefined;
      }
    })();
    return { error: (errorPayload ? getProviderError(errorPayload) : undefined) ?? errorText.slice(0, 500) ?? "Anthropic request failed." };
  }

  const payload = (await upstream.json()) as unknown;
  const output = extractAnthropicText(payload);
  if (!output) return { error: "Anthropic returned an empty response." };

  const data = payload as {
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string;
  };
  const promptTokens = data.usage?.input_tokens;
  const completionTokens = data.usage?.output_tokens;
  return {
    output,
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
  };
}

export type StoryStructureContext = {
  openingTitle?: string;
  introNarration?: string;
  chapters?: { title: string; description: string }[];
  climaxDescription?: string;
  closingMessage?: string;
  dedicationText?: string;
};

export type StoryPromptContext = {
  locale: string;
  mode: "story" | "slideshow" | "documentary";
  storyMode?: string;
  emotionalTone?: string;
  visualStyle?: string;
  userNotes?: string;
  captions?: string[];
  exifSummary?: string;
  /** Target video duration in seconds (10–90, multiple of 5). Drives narration length. */
  targetDurationSeconds?: number;
  /** Optional story structure with opening title, chapters, climax, etc. */
  storyStructure?: StoryStructureContext;
};

export function buildStorySystemPrompt(locale: string): string {
  return `You are an expert multilingual storyteller and video scriptwriter for an AI-powered photo-to-story video creator called Vionto. Write warm, poetic, emotionally resonant narration that matches the selected locale language and cultural tone. Output ONLY a JSON object with two keys: "narration" (plain-text narration string) and "srt" (valid SRT subtitle string with timing cues). No markdown, no commentary outside the JSON.`;
}

export function buildStoryUserPrompt(ctx: StoryPromptContext): string {
  const lines: string[] = [];
  lines.push(`Locale: ${ctx.locale}`);
  lines.push(`Mode: ${ctx.mode}`);
  if (ctx.storyMode) {
    lines.push(`Story mode: ${ctx.storyMode}`);
  }
  if (ctx.emotionalTone) {
    lines.push(`Emotional tone: ${ctx.emotionalTone}`);
  }
  if (ctx.visualStyle) {
    lines.push(`Visual style: ${ctx.visualStyle}`);
  }
  if (ctx.userNotes && ctx.userNotes.trim()) {
    lines.push(`User notes: ${ctx.userNotes.trim()}`);
  }
  if (ctx.captions && ctx.captions.length > 0) {
    lines.push(`Image captions: ${ctx.captions.join("; ")}`);
  }
  if (ctx.exifSummary && ctx.exifSummary.trim()) {
    lines.push(`Photo metadata: ${ctx.exifSummary.trim()}`);
  }

  // Story structure — give the LLM explicit narrative skeleton when provided.
  const ss = ctx.storyStructure;
  if (ss) {
    const structureLines: string[] = [];
    if (ss.openingTitle) structureLines.push(`Opening title: "${ss.openingTitle}"`);
    if (ss.introNarration) structureLines.push(`Intro narration: ${ss.introNarration}`);
    if (ss.chapters && ss.chapters.length > 0) {
      const chapStr = ss.chapters
        .filter((c) => c.title || c.description)
        .map((c, i) => `Chapter ${i + 1}${c.title ? `: ${c.title}` : ""}${c.description ? ` — ${c.description}` : ""}`)
        .join("; ");
      if (chapStr) structureLines.push(`Chapters: ${chapStr}`);
    }
    if (ss.climaxDescription) structureLines.push(`Climax/highlight: ${ss.climaxDescription}`);
    if (ss.closingMessage) structureLines.push(`Closing message: "${ss.closingMessage}"`);
    if (ss.dedicationText) structureLines.push(`Dedication: "${ss.dedicationText}"`);
    if (structureLines.length > 0) {
      lines.push("");
      lines.push("Story structure provided by the user:");
      structureLines.forEach((l) => lines.push(`- ${l}`));
    }
  }

  lines.push("");
  lines.push("Instructions:");
  
  // Add emotional tone-specific instructions
  if (ctx.emotionalTone === "nostalgic") {
    lines.push("- Write warm, reflective, memory-focused narration with a slower, contemplative pace.");
    lines.push("- Use language that evokes longing, fondness, and sentimental reflection.");
  } else if (ctx.emotionalTone === "joyful") {
    lines.push("- Write bright, celebratory, upbeat narration for happy moments and events.");
    lines.push("- Use enthusiastic, energetic language that captures joy and excitement.");
  } else if (ctx.emotionalTone === "calm") {
    lines.push("- Write soft, peaceful, minimal narration with a gentle, unhurried pace.");
    lines.push("- Use serene, tranquil language that creates a sense of peace and relaxation.");
  } else if (ctx.emotionalTone === "epic") {
    lines.push("- Write cinematic, dramatic, grand narration for big trips, milestones, and highlights.");
    lines.push("- Use powerful, awe-inspiring language that conveys magnitude and significance.");
  } else if (ctx.emotionalTone === "funny") {
    lines.push("- Write light, playful, witty narration for casual albums and social edits.");
    lines.push("- Use humorous, clever language that brings a smile and lightens the mood.");
  } else if (ctx.emotionalTone === "romantic") {
    lines.push("- Write tender, intimate, affectionate narration for couples, weddings, anniversaries, and love stories.");
    lines.push("- Use loving, gentle language that expresses affection and deep emotional connection.");
  } else if (ctx.emotionalTone === "reflective") {
    lines.push("- Write thoughtful, grounded, introspective narration for personal archives or meaningful life moments.");
    lines.push("- Use contemplative, sincere language that encourages deeper meaning and insight.");
  }
  
  // Add story mode-specific instructions
  if (ctx.storyMode === "memory_film") {
    lines.push("- Write an emotional, cinematic narration for personal memories and reflective albums.");
    lines.push("- Focus on feelings, nostalgia, and the emotional arc of the memories.");
  } else if (ctx.storyMode === "travel_recap") {
    lines.push("- Write a location-aware recap for trips, routes, and highlights.");
    lines.push("- Emphasize date/place progression and the journey narrative.");
  } else if (ctx.storyMode === "family_archive") {
    lines.push("- Write warm, chronological, people-focused storytelling for family albums.");
    lines.push("- Focus on relationships, generations, and family milestones.");
  } else if (ctx.storyMode === "event_recap") {
    lines.push("- Write a highlight-driven recap for weddings, birthdays, graduations, parties, and gatherings.");
    lines.push("- Focus on key moments, celebrations, and event highlights.");
  } else if (ctx.storyMode === "social_reel") {
    lines.push("- Write short, fast-paced narration optimized for vertical social media (Reels, TikTok, Shorts).");
    lines.push("- Use punchy, engaging language that works well in short form.");
  } else if (ctx.storyMode === "documentary") {
    lines.push("- Write slower, more factual narration with emphasis on timeline, context, and observed details.");
    lines.push("- Focus on historical context and factual accuracy.");
  } else if (!ctx.emotionalTone) {
    lines.push("- Write a cohesive narration that flows across the provided images.");
  }

  if (ctx.visualStyle === "social_vertical_captions") {
    lines.push("- Keep sentences short and caption-friendly so bold centered subtitles read quickly.");
  } else if (ctx.visualStyle === "travel_map_overlay") {
    lines.push("- Mention place, movement, route, arrival, or discovery when the photos support it.");
  } else if (ctx.visualStyle === "vhs_archive" || ctx.visualStyle === "polaroid_memory") {
    lines.push("- Lean into archive, memory, and time-passing language when it fits the album.");
  } else if (ctx.visualStyle === "wedding_cinematic") {
    lines.push("- Favor elegant, intimate phrasing that works with a cinematic wedding treatment.");
  }
  
  // Story structure instructions
  if (ss) {
    const hasContent = ss.openingTitle || ss.introNarration || (ss.chapters && ss.chapters.length > 0) || ss.climaxDescription || ss.closingMessage || ss.dedicationText;
    if (hasContent) {
      lines.push("- Follow the user's story structure. Incorporate the opening title, chapter flow, climax, closing, and dedication into the narration naturally.");
      if (ss.openingTitle) lines.push(`- Start the narration by referencing or incorporating the opening title: "${ss.openingTitle}".`);
      if (ss.closingMessage) lines.push(`- End the narration with the closing message: "${ss.closingMessage}".`);
      if (ss.dedicationText) lines.push(`- Include a brief dedication at the very end: "${ss.dedicationText}".`);
      lines.push("- If a field is empty, skip it naturally — do not create placeholder content for missing fields.");
    }
  }

  // Duration-aware narration and SRT instructions
  const targetSec = ctx.targetDurationSeconds ?? 30;
  const approxWords = Math.round(targetSec * 2.5); // ~150 wpm speaking rate
  lines.push(`- Target video duration: ${targetSec} seconds. Write narration of approximately ${approxWords} words so the spoken voiceover fits within that duration.`);
  lines.push(`- The SRT output should have one cue per sentence, with timing that spans the full ${targetSec} seconds. Do not exceed ${targetSec} seconds in total SRT duration.`);
  lines.push("- Escape angle brackets in SRT text as &lt; and &gt;.");
  lines.push("- Do not include empty lines inside a cue text block.");
  lines.push("- Output JSON only.");
  return lines.join("\n");
}

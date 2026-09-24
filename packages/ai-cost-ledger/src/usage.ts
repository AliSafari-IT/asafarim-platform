import { z } from "zod";

/**
 * Mutually exclusive usage buckets. A token/unit is counted in exactly one
 * bucket, so a cost computed as Σ(bucket × rate) can never double-count —
 * the Langfuse "usage details" model.
 *
 * Provider counts are frequently *inclusive* (OpenAI's `prompt_tokens`
 * already contains `cached_tokens`; `completion_tokens` already contains
 * `reasoning_tokens`). Those are normalized by the helpers below **before**
 * persistence — a stored `input` quantity always means "uncached input".
 */
export const USAGE_BUCKETS = [
  "input",
  "cached_input",
  "cache_write_input",
  "output",
  "reasoning_output",
  "audio_input",
  "audio_output",
  "image_input",
  "image_output",
  "video_output",
  "tts_output",
  "tool_call",
  "request",
] as const;
export type UsageBucket = (typeof USAGE_BUCKETS)[number];

export const USAGE_UNITS = ["tokens", "characters", "seconds", "images", "calls", "requests"] as const;
export type UsageUnit = (typeof USAGE_UNITS)[number];

export const UsageLineSchema = z
  .object({
    bucket: z.enum(USAGE_BUCKETS),
    unit: z.enum(USAGE_UNITS),
    /** Integer quantity. Fractional seconds are recorded in the smallest
     *  unit the provider bills (e.g. whole seconds), never as a float. */
    quantity: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type UsageLine = z.infer<typeof UsageLineSchema>;

export const UsageSchema = z.array(UsageLineSchema).superRefine((lines, ctx) => {
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    const key = `${line.bucket}:${line.unit}`;
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [i],
        message: `usage bucket "${key}" appears twice — buckets must be exclusive`,
      });
    }
    seen.add(key);
  }
});

export class UsageNormalizationError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "UsageNormalizationError";
  }
}

function subtract(total: number, part: number, label: string): number {
  if (part > total) {
    throw new UsageNormalizationError(`${label}: sub-count ${part} exceeds inclusive total ${total}`);
  }
  return total - part;
}

function tokenLines(entries: [UsageBucket, number][]): UsageLine[] {
  return entries
    .filter(([, quantity]) => quantity > 0)
    .map(([bucket, quantity]) => ({ bucket, unit: "tokens" as const, quantity }));
}

/**
 * OpenAI Chat Completions / Responses usage. `prompt_tokens` (or
 * `input_tokens`) **includes** cached tokens; `completion_tokens` (or
 * `output_tokens`) **includes** reasoning tokens.
 */
export function normalizeOpenAiUsage(usage: {
  prompt_tokens?: number;
  input_tokens?: number;
  completion_tokens?: number;
  output_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; audio_tokens?: number } | null;
  input_tokens_details?: { cached_tokens?: number } | null;
  completion_tokens_details?: { reasoning_tokens?: number; audio_tokens?: number } | null;
  output_tokens_details?: { reasoning_tokens?: number } | null;
}): UsageLine[] {
  const inputTotal = usage.prompt_tokens ?? usage.input_tokens ?? 0;
  const outputTotal = usage.completion_tokens ?? usage.output_tokens ?? 0;
  const cached = usage.prompt_tokens_details?.cached_tokens ?? usage.input_tokens_details?.cached_tokens ?? 0;
  const audioIn = usage.prompt_tokens_details?.audio_tokens ?? 0;
  const reasoning =
    usage.completion_tokens_details?.reasoning_tokens ?? usage.output_tokens_details?.reasoning_tokens ?? 0;
  const audioOut = usage.completion_tokens_details?.audio_tokens ?? 0;

  const plainInput = subtract(subtract(inputTotal, cached, "openai input"), audioIn, "openai input");
  const plainOutput = subtract(subtract(outputTotal, reasoning, "openai output"), audioOut, "openai output");

  return tokenLines([
    ["input", plainInput],
    ["cached_input", cached],
    ["audio_input", audioIn],
    ["output", plainOutput],
    ["reasoning_output", reasoning],
    ["audio_output", audioOut],
  ]);
}

/**
 * Anthropic Messages usage. `input_tokens` is **already exclusive** of
 * `cache_read_input_tokens` and `cache_creation_input_tokens`; extended
 * thinking is billed inside `output_tokens` with no separate count, so it
 * stays in `output` rather than being guessed into `reasoning_output`.
 */
export function normalizeAnthropicUsage(usage: {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}): UsageLine[] {
  return tokenLines([
    ["input", usage.input_tokens ?? 0],
    ["cached_input", usage.cache_read_input_tokens ?? 0],
    ["cache_write_input", usage.cache_creation_input_tokens ?? 0],
    ["output", usage.output_tokens ?? 0],
  ]);
}

/** Plain input/output counts from a provider that exposes nothing finer. */
export function simpleTokenUsage(inputTokens: number, outputTokens: number): UsageLine[] {
  return tokenLines([
    ["input", Math.max(0, Math.trunc(inputTokens))],
    ["output", Math.max(0, Math.trunc(outputTokens))],
  ]);
}

export function quantityOf(usage: readonly UsageLine[], bucket: UsageBucket): number {
  return usage.filter((l) => l.bucket === bucket).reduce((n, l) => n + l.quantity, 0);
}

/** All input-side token buckets (uncached + cached + cache writes + audio/image in). */
export function totalInputTokens(usage: readonly UsageLine[]): number {
  return usage
    .filter((l) => l.unit === "tokens" && ["input", "cached_input", "cache_write_input", "audio_input", "image_input"].includes(l.bucket))
    .reduce((n, l) => n + l.quantity, 0);
}

/** All output-side token buckets (plain + reasoning + audio/image out). */
export function totalOutputTokens(usage: readonly UsageLine[]): number {
  return usage
    .filter((l) => l.unit === "tokens" && ["output", "reasoning_output", "audio_output", "image_output"].includes(l.bucket))
    .reduce((n, l) => n + l.quantity, 0);
}

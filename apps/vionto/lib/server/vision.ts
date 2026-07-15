/**
 * Vision captioning service for Vionto.
 * Generates image captions using AI providers (OpenAI Vision, Anthropic, etc.)
 */

import { getObjectBytes } from "./storage";

export type CaptionProvider = "openai" | "anthropic" | "google" | "manual";
export type CaptionResult = {
  caption: string;
  provider: CaptionProvider;
  model: string;
  tokens?: number;
  latencyMs?: number;
};

const MAX_VISION_IMAGE_BYTES = 20 * 1024 * 1024;

function inferImageMediaType(storageKey: string): string {
  const lower = storageKey.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function captionPrompt(locale: string): string {
  return `Describe this image in 1-2 sentences for a photo story. Focus on the main subject, action, mood, and setting. Be concise but descriptive. Write the caption in locale "${locale}".`;
}

/**
 * Generate a caption for an image using OpenAI Vision API.
 */
async function captionWithOpenAI(imageBuffer: Buffer, mediaType: string, locale: string = "en"): Promise<CaptionResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY not configured");
  }

  const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
  const startTime = Date.now();

  // Convert image to base64
  const base64Image = imageBuffer.toString("base64");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: captionPrompt(locale),
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mediaType};base64,${base64Image}`,
                detail: "low",
              },
            },
          ],
        },
      ],
      max_tokens: 150,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI Vision API error: ${error}`);
  }

  const data = await response.json();
  const caption = data.choices[0]?.message?.content?.trim() || "";
  const tokens = data.usage?.total_tokens;
  const latencyMs = Date.now() - startTime;

  return {
    caption,
    provider: "openai",
    model,
    tokens,
    latencyMs,
  };
}

/**
 * Generate a caption for an image using Anthropic Claude Vision API.
 */
async function captionWithAnthropic(imageBuffer: Buffer, mediaType: string, locale: string = "en"): Promise<CaptionResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const model = process.env.ANTHROPIC_VISION_MODEL || "claude-3-haiku-20240307";
  const startTime = Date.now();

  // Convert image to base64
  const base64Image = imageBuffer.toString("base64");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 150,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: base64Image,
              },
            },
            {
              type: "text",
              text: captionPrompt(locale),
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Anthropic Vision API error: ${error}`);
  }

  const data = await response.json();
  const caption = data.content[0]?.text?.trim() || "";
  const tokens = data.usage?.input_tokens + data.usage?.output_tokens;
  const latencyMs = Date.now() - startTime;

  return {
    caption,
    provider: "anthropic",
    model,
    tokens,
    latencyMs,
  };
}

/**
 * Generate a caption for an image stored in Vionto storage.
 * Attempts OpenAI first, falls back to Anthropic if OpenAI fails.
 */
export async function generateImageCaption(
  storageKey: string,
  locale: string = "en",
  preferredProvider?: CaptionProvider,
): Promise<CaptionResult> {
  // Fetch image bytes from storage
  const imageBuffer = await getObjectBytes(storageKey, MAX_VISION_IMAGE_BYTES);
  if (!imageBuffer) {
    throw new Error("Image not found in storage");
  }
  const mediaType = inferImageMediaType(storageKey);

  // Try preferred provider first, or default to OpenAI
  if (preferredProvider === "anthropic") {
    try {
      return await captionWithAnthropic(imageBuffer, mediaType, locale);
    } catch (error) {
      console.error("[vision] Anthropic caption failed, trying OpenAI:", error);
    }
  }

  // Try OpenAI
  try {
    return await captionWithOpenAI(imageBuffer, mediaType, locale);
  } catch (error) {
    console.error("[vision] OpenAI caption failed, trying Anthropic:", error);
  }

  // Fallback to Anthropic
  try {
    return await captionWithAnthropic(imageBuffer, mediaType, locale);
  } catch (error) {
    console.error("[vision] Anthropic caption also failed:", error);
    throw new Error("All vision caption providers failed");
  }
}

/**
 * Batch generate captions for multiple images.
 * Processes images in parallel with concurrency limit.
 */
export async function generateImageCaptions(
  storageKeys: string[],
  locale: string = "en",
  concurrency: number = 3,
): Promise<Map<string, CaptionResult>> {
  const results = new Map<string, CaptionResult>();
  const errors = new Map<string, Error>();

  // Process in batches
  for (let i = 0; i < storageKeys.length; i += concurrency) {
    const batch = storageKeys.slice(i, i + concurrency);
    const batchPromises = batch.map(async (key) => {
      try {
        const result = await generateImageCaption(key, locale);
        results.set(key, result);
      } catch (error) {
        errors.set(key, error as Error);
      }
    });

    await Promise.all(batchPromises);
  }

  if (errors.size > 0) {
    console.error("[vision] Some captions failed:", Object.fromEntries(errors));
  }

  return results;
}

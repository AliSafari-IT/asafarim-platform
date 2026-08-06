import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildSystemPrompt,
  buildVisionContent,
  generateWithOpenAI,
  generateWithAnthropic,
  transcribeAudio,
  type VisionContent,
} from "../ai-orchestrator";
import * as storage from "../storage";

describe("buildSystemPrompt", () => {
  /**
   * The bug this fixes: "Answer in the same language as the student
   * question" is the whole language instruction with no fallback. A real
   * inquiry description — "algebera II", two words, arguably a typo — gave
   * the model nothing to detect a language from, and it answered a
   * Dutch-locale student in Spanish.
   */
  it("without a locale hint, only tells the model to mirror the question", () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain("Answer in the same language as the student question.");
    expect(prompt).not.toContain("app is set to");
  });

  it("with a locale hint, gives a named-language fallback for ambiguous questions", () => {
    const prompt = buildSystemPrompt("nl-BE");
    expect(prompt).toContain("Dutch");
    expect(prompt).toContain("too short or ambiguous");
  });

  it("still prioritises the question's own language when the hint disagrees", () => {
    // A French-locale student writing clearly in English should still get
    // an English answer — the hint is a fallback, not an override.
    const prompt = buildSystemPrompt("fr-BE");
    expect(prompt).toMatch(/clearly identifiable from the text/);
    expect(prompt).toContain("French");
  });

  it("maps every base language to a name a model can act on", () => {
    for (const locale of ["en", "nl-NL", "fr-LU", "de-LU", "lb-LU"] as const) {
      expect(buildSystemPrompt(locale)).not.toContain("undefined");
    }
  });

  it("falls back to English for an unrecognised locale rather than erroring", () => {
    expect(() => buildSystemPrompt("xx-YY")).not.toThrow();
    expect(buildSystemPrompt("xx-YY")).toContain("English");
  });
});

describe("transcribeAudio", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns null when OPENAI_API_KEY is missing", async () => {
    vi.unstubAllEnvs();
    const result = await transcribeAudio("https://cdn.example.com/voice.webm");
    expect(result).toBeNull();
  });

  it("returns transcript text on success", async () => {
    const fakeBlob = new Blob(["fake audio"], { type: "audio/webm" });
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => fakeBlob,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: "Hello teacher, I need help with algebra." }),
      } as unknown as Response);

    const result = await transcribeAudio("https://cdn.example.com/voice.webm");
    expect(result?.text).toBe("Hello teacher, I need help with algebra.");
  });

  it("returns null on API failure", async () => {
    const fakeBlob = new Blob(["fake audio"], { type: "audio/webm" });
    vi.mocked(global.fetch)
      .mockResolvedValueOnce({
        ok: true,
        blob: async () => fakeBlob,
      } as unknown as Response)
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: { message: "Bad request" } }),
      } as unknown as Response);

    const result = await transcribeAudio("https://cdn.example.com/voice.webm");
    expect(result).toBeNull();
  });
});

describe("buildVisionContent", () => {
  it("returns text-only when no image attachments", async () => {
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);

    const content = await buildVisionContent("Solve this problem", [
      { url: "https://cdn.example.com/doc.pdf", mime: "application/pdf" },
    ]);

    expect(content).toHaveLength(1);
    expect(content[0]).toEqual({ type: "text", text: "Solve this problem" });
  });

  it("includes image URLs for image attachments that exist", async () => {
    vi.spyOn(storage, "objectExists").mockImplementation(async (url) =>
      url.includes("photo"),
    );

    const content = await buildVisionContent("Find x", [
      { url: "https://cdn.example.com/photo1.png", mime: "image/png" },
      { url: "https://cdn.example.com/photo2.jpg", mime: "image/jpeg" },
      { url: "https://cdn.example.com/doc.pdf", mime: "application/pdf" },
    ]);

    expect(content).toHaveLength(3); // text + 2 images
    expect(content[0]).toEqual({ type: "text", text: "Find x" });
    expect(content[1]).toMatchObject({ type: "image_url" });
    expect(content[2]).toMatchObject({ type: "image_url" });
  });

  it("caps at 4 images (OpenAI limit)", async () => {
    vi.spyOn(storage, "objectExists").mockResolvedValue(true);

    const images = Array.from({ length: 6 }, (_, i) => ({
      url: `https://cdn.example.com/img${i}.png`,
      mime: "image/png" as const,
    }));

    const content = await buildVisionContent("Compare these", images);
    const imageCount = content.filter((c) => c.type === "image_url").length;
    expect(imageCount).toBe(4);
  });

  it("skips images that fail HEAD check", async () => {
    vi.spyOn(storage, "objectExists").mockResolvedValue(false);

    const content = await buildVisionContent("Check this", [
      { url: "https://cdn.example.com/missing.png", mime: "image/png" },
    ]);

    expect(content).toHaveLength(1); // only text
  });
});

describe("generateWithOpenAI", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL_VISION", "gpt-4o");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns error when API key missing", async () => {
    vi.unstubAllEnvs();
    const result = await generateWithOpenAI(
      [{ type: "text", text: "Hello" }],
      "You are a tutor",
    );
    expect(result).toHaveProperty("error", "OPENAI_API_KEY not configured.");
  });

  it("uses vision model when images present", async () => {
    let usedModel: string | undefined;
    vi.mocked(global.fetch).mockImplementation(async (_url, init) => {
      const body = JSON.parse((init as { body: string }).body);
      usedModel = body.model;
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "I see a triangle." }, finish_reason: "stop" }],
          usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        }),
      } as unknown as Response;
    });

    const content: VisionContent[] = [
      { type: "text", text: "What shape?" },
      { type: "image_url", image_url: { url: "https://cdn.example.com/shape.png" } },
    ];

    await generateWithOpenAI(content, "You are a tutor");
    expect(usedModel).toBe("gpt-4o");
  });

  it("returns success with token counts on valid response", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: { content: "The answer is 42." },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
      }),
    } as unknown as Response);

    const result = await generateWithOpenAI(
      [{ type: "text", text: "What is 6*7?" }],
      "You are a tutor",
    );

    if ("error" in result) throw new Error("Expected success");
    expect(result.output).toBe("The answer is 42.");
    expect(result.provider).toBe("openai");
    expect(result.promptTokens).toBe(20);
    expect(result.completionTokens).toBe(10);
    expect(result.totalTokens).toBe(30);
    expect(result.truncated).toBe(false);
    expect(result.stopReason).toBe("stop");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("detects truncation via finish_reason", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Partial..." }, finish_reason: "length" }],
        usage: { prompt_tokens: 100, completion_tokens: 4000 },
      }),
    } as unknown as Response);

    const result = await generateWithOpenAI([{ type: "text", text: "Long essay" }], "Tutor");

    if ("error" in result) throw new Error("Expected success");
    expect(result.truncated).toBe(true);
    expect(result.stopReason).toBe("length");
  });

  it("returns error on API failure", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: { message: "Rate limit exceeded" } }),
    } as unknown as Response);

    const result = await generateWithOpenAI([{ type: "text", text: "Hi" }], "Tutor");
    expect(result).toHaveProperty("error");
    if ("error" in result) {
      expect(result.error).toContain("Rate limit");
    }
  });
});

describe("generateWithAnthropic", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("returns error when API key missing", async () => {
    vi.unstubAllEnvs();
    const result = await generateWithAnthropic("Hello", "Tutor");
    expect(result).toHaveProperty("error", "ANTHROPIC_API_KEY not configured.");
  });

  it("returns success with token counts", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Bonjour!" }],
        usage: { input_tokens: 10, output_tokens: 5 },
        stop_reason: "end_turn",
      }),
    } as unknown as Response);

    const result = await generateWithAnthropic("Say hi in French", "Tutor");

    if ("error" in result) throw new Error("Expected success");
    expect(result.output).toBe("Bonjour!");
    expect(result.provider).toBe("anthropic");
    expect(result.model).toBe("claude-haiku-4-5");
    expect(result.promptTokens).toBe(10);
    expect(result.completionTokens).toBe(5);
    expect(result.totalTokens).toBe(15);
    expect(result.truncated).toBe(false);
  });

  it("detects truncation via max_tokens stop_reason", async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        content: [{ type: "text", text: "Partial..." }],
        usage: { input_tokens: 100, output_tokens: 4000 },
        stop_reason: "max_tokens",
      }),
    } as unknown as Response);

    const result = await generateWithAnthropic("Write a novel", "Tutor");

    if ("error" in result) throw new Error("Expected success");
    expect(result.truncated).toBe(true);
  });
});

describe("Vision content structure", () => {
  it("matches OpenAI chat completions schema", () => {
    const content: VisionContent[] = [
      { type: "text", text: "Find x" },
      { type: "image_url", image_url: { url: "https://cdn.example.com/problem.png" } },
    ];

    // Should be JSON-serializable and match expected OpenAI structure
    const json = JSON.stringify(content);
    const parsed = JSON.parse(json) as VisionContent[];
    expect(parsed[0].type).toBe("text");
    expect(parsed[1].type).toBe("image_url");
    expect(parsed[1]).toHaveProperty("image_url.url");
  });
});

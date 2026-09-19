import { afterEach, describe, expect, it, vi } from "vitest";
import { TailorProviderError } from "../provider";
import { AnthropicTailorProvider } from "./anthropic";

const provider = new AnthropicTailorProvider();

function call() {
  return {
    profileText: "profile",
    jobText: "job",
    system: "system",
    user: "user",
    promptVersion: "tailor_resume@2",
    model: "claude-opus-5",
    profileSkillNames: ["React"],
    experienceSummaries: [null],
  };
}

function mockFetchOnce(response: Partial<Response> & { jsonBody?: unknown; textBody?: string }) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonBody,
    text: async () => response.textBody ?? "",
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("AnthropicTailorProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_MAX_TOKENS;
  });

  it("throws a non-retryable error when no API key is configured", async () => {
    await expect(provider.generate(call())).rejects.toMatchObject({ name: "TailorProviderError", retryable: false });
  });

  it("parses valid suggestions from bare JSON text", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockFetchOnce({
      jsonBody: {
        content: [{ type: "text", text: JSON.stringify({ headline: "Backend Engineer", skillsOrder: ["React"] }) }],
        usage: { input_tokens: 1000, output_tokens: 200 },
      },
    });

    const output = await provider.generate(call());
    expect(output.suggestions.headline).toBe("Backend Engineer");
    expect(output.costUsd).toBeGreaterThan(0);
  });

  it("recovers a JSON object even when the model wraps it in prose", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockFetchOnce({
      jsonBody: {
        content: [{ type: "text", text: `Sure, here you go:\n${JSON.stringify({ headline: "Engineer" })}\nHope that helps!` }],
      },
    });

    const output = await provider.generate(call());
    expect(output.suggestions.headline).toBe("Engineer");
  });

  it("marks a 429 as retryable and a 400 as not", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockFetchOnce({ ok: false, status: 429, textBody: "rate limited" });
    await expect(provider.generate(call())).rejects.toMatchObject({ retryable: true });

    mockFetchOnce({ ok: false, status: 400, textBody: "bad request" });
    await expect(provider.generate(call())).rejects.toMatchObject({ retryable: false });
  });

  it("treats a response with no text block as a retryable failure", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockFetchOnce({ jsonBody: { content: [] } });
    await expect(provider.generate(call())).rejects.toBeInstanceOf(TailorProviderError);
  });
});

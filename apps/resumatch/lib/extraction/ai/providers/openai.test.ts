import { afterEach, describe, expect, it, vi } from "vitest";
import { ExtractionProviderError } from "../provider";
import { OpenAiExtractionProvider } from "./openai";

const provider = new OpenAiExtractionProvider();

function call() {
  return { text: "Jane Doe", system: "system", user: "user", promptVersion: "extract_profile@1", model: "gpt-4o-mini" };
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

describe("OpenAiExtractionProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("throws a non-retryable error when no API key is configured", async () => {
    await expect(provider.extract(call())).rejects.toMatchObject({
      name: "ExtractionProviderError",
      retryable: false,
    });
  });

  it("parses the model's JSON content and reports token-based cost", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({
      jsonBody: {
        choices: [{ message: { content: JSON.stringify({ fullName: "Jane Doe" }) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 200 },
      },
    });

    const output = await provider.extract(call());
    expect(output.data).toEqual({ fullName: "Jane Doe" });
    expect(output.inputTokens).toBe(1000);
    expect(output.outputTokens).toBe(200);
    expect(output.costUsd).toBeGreaterThan(0);
  });

  it("marks a 429 as retryable and a 400 as not", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({ ok: false, status: 429, textBody: "rate limited" });
    await expect(provider.extract(call())).rejects.toMatchObject({ retryable: true });

    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({ ok: false, status: 400, textBody: "bad request" });
    await expect(provider.extract(call())).rejects.toMatchObject({ retryable: false });
  });

  it("treats malformed JSON content as a non-retryable failure, not a crash", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({
      jsonBody: { choices: [{ message: { content: "not json" } }] },
    });
    await expect(provider.extract(call())).rejects.toBeInstanceOf(ExtractionProviderError);
  });
});

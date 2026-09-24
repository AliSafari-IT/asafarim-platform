import { afterEach, describe, expect, it, vi } from "vitest";
import { TailorProviderError } from "../provider";
import { OpenAiTailorProvider } from "./openai";

const provider = new OpenAiTailorProvider();

function call() {
  return {
    profileText: "profile",
    jobText: "job",
    system: "system",
    user: "user",
    promptVersion: "tailor_resume@2",
    model: "gpt-4o-mini",
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

describe("OpenAiTailorProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it("throws a non-retryable error when no API key is configured", async () => {
    await expect(provider.generate(call())).rejects.toMatchObject({ name: "TailorProviderError", retryable: false });
  });

  it("parses valid suggestions and reports token-based cost", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({
      jsonBody: {
        choices: [{ message: { content: JSON.stringify({ headline: "Backend Engineer", skillsOrder: ["React"] }) } }],
        usage: { prompt_tokens: 1000, completion_tokens: 200 },
      },
    });

    const output = await provider.generate(call());
    expect(output.suggestions.headline).toBe("Backend Engineer");
    expect(output.costUsd).toBeGreaterThan(0);
  });

  it("treats a response that fails schema validation as a failed call", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({
      jsonBody: { choices: [{ message: { content: JSON.stringify({ skillsOrder: [123] }) } }] },
    });
    await expect(provider.generate(call())).rejects.toBeTruthy();
  });

  it("marks a 429 as retryable and a 400 as not", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({ ok: false, status: 429, textBody: "rate limited" });
    await expect(provider.generate(call())).rejects.toMatchObject({ retryable: true });

    mockFetchOnce({ ok: false, status: 400, textBody: "bad request" });
    await expect(provider.generate(call())).rejects.toMatchObject({ retryable: false });
  });

  it("treats malformed JSON content as a non-retryable failure", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockFetchOnce({ jsonBody: { choices: [{ message: { content: "not json" } }] } });
    await expect(provider.generate(call())).rejects.toBeInstanceOf(TailorProviderError);
  });
});

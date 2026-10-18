/**
 * Issue #540: both AI paths record one cost event per paid provider call —
 * queued answers, streamed answers and Whisper transcription — and store
 * the attempt's cost on the response row.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  eduInquiry: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  eduAiResponse: { create: vi.fn() },
  eduAiCostEvent: { createMany: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("@asafarim/db", () => ({ prisma: prismaMock }));
// Spend controls (#539) are tested in ai-quota*.test.ts; here they always allow.
vi.mock("@/lib/server/ai-quota", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-quota")>()),
  assertCanGenerateAiResponse: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/audit", () => ({ recordEduAuditEvent: vi.fn() }));
vi.mock("@/lib/server/storage", () => ({
  objectExists: vi.fn(async () => true),
  getSignedDownloadUrl: vi.fn(async (key: string) => `https://signed.example/${key}`),
}));

type CostRow = Record<string, unknown>;
function costRows(): CostRow[] {
  return prismaMock.eduAiCostEvent.createMany.mock.calls.map(([arg]) => arg.data[0] as CostRow);
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response;
}

function sseResponse(events: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const e of events) controller.enqueue(enc.encode(e));
      controller.close();
    },
  });
  return { ok: true, status: 200, body } as unknown as Response;
}

beforeEach(() => {
  prismaMock.eduInquiry.findUnique.mockReset();
  prismaMock.eduInquiry.update.mockReset().mockResolvedValue({});
  prismaMock.eduInquiry.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.$transaction
    .mockReset()
    .mockImplementation((fn: (tx: typeof prismaMock) => unknown) => fn(prismaMock));
  prismaMock.eduAiResponse.create.mockReset().mockResolvedValue({ id: "resp-1" });
  prismaMock.eduAiCostEvent.createMany.mockReset().mockResolvedValue({ count: 1 });
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
});

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
});

describe("orchestrateResponse (queued path)", () => {
  function inquiry(attachments: unknown[] = []) {
    prismaMock.eduInquiry.findUnique.mockResolvedValue({
      id: "inq-1",
      studentId: "stu-1",
      status: "OPEN",
      description: "How do I solve 3x + 5 = 20?",
      attachments,
      aiResponses: [],
    });
  }

  const openAiOk = {
    id: "chatcmpl-1",
    model: "gpt-4o-mini-2024-07-18",
    choices: [{ message: { content: "Subtract 5 first." }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1000, completion_tokens: 500, total_tokens: 1500 },
  };

  it("records the answer's cost and stores it on the response", async () => {
    inquiry();
    global.fetch = vi.fn(async () => jsonResponse(openAiOk)) as unknown as typeof fetch;

    const { orchestrateResponse } = await import("@/lib/server/ai-orchestrator");
    await orchestrateResponse("inq-1");

    const rows = costRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: "tutor_answer",
      outcome: "succeeded",
      userId: "stu-1",
      subjectId: "inq-1",
      provider: "openai",
      requestModel: "gpt-4o-mini",
      responseModel: "gpt-4o-mini-2024-07-18",
      providerRequestId: "chatcmpl-1",
      estimatedCostMicros: BigInt(450),
    });
    expect(prismaMock.eduAiResponse.create.mock.calls[0][0].data).toMatchObject({
      promptTokens: 1000,
      completionTokens: 500,
      tokenCostMicros: 450,
    });
  });

  it("records a billed-but-empty OpenAI call as failed, then the fallback", async () => {
    inquiry();
    global.fetch = vi.fn(async (url: string | URL | Request) =>
      String(url).includes("openai")
        ? jsonResponse({ ...openAiOk, choices: [{ message: { content: "" }, finish_reason: "stop" }] })
        : jsonResponse({
            id: "msg_1",
            model: "claude-haiku-4-5-20251001",
            content: [{ type: "text", text: "Subtract 5 first." }],
            stop_reason: "end_turn",
            usage: { input_tokens: 1000, output_tokens: 100 },
          }),
    ) as unknown as typeof fetch;

    const { orchestrateResponse } = await import("@/lib/server/ai-orchestrator");
    await orchestrateResponse("inq-1");

    const rows = costRows();
    expect(rows.map((r) => [r.provider, r.outcome])).toEqual([
      ["openai", "failed"],
      ["anthropic", "succeeded"],
    ]);
    // 450 (gpt-4o-mini) + 1000 × $1/M + 100 × $5/M = 450 + 1500.
    expect(rows[1].estimatedCostMicros).toBe(BigInt(1500));
    expect(prismaMock.eduAiResponse.create.mock.calls[0][0].data.tokenCostMicros).toBe(1950);
    expect(new Set(rows.map((r) => r.idempotencyKey)).size).toBe(2);
  });

  it("records nothing for a provider call that was refused before billing", async () => {
    inquiry();
    global.fetch = vi.fn(async () =>
      jsonResponse({ error: { message: "quota" } }, false, 429),
    ) as unknown as typeof fetch;

    const { orchestrateResponse } = await import("@/lib/server/ai-orchestrator");
    await orchestrateResponse("inq-1");

    expect(costRows()).toHaveLength(0);
    expect(prismaMock.eduAiResponse.create.mock.calls[0][0].data.tokenCostMicros).toBeNull();
  });

  it("records Whisper transcription by audio duration", async () => {
    inquiry([{ url: "https://signed.example/voice.webm", mime: "audio/webm" }]);
    const whisperForms: FormData[] = [];
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("signed.example")) {
        return { ok: true, blob: async () => new Blob(["x"]) } as unknown as Response;
      }
      if (u.includes("audio/transcriptions")) {
        whisperForms.push(init?.body as FormData);
        return jsonResponse({ text: "three x plus five", duration: 90, language: "en" });
      }
      return jsonResponse(openAiOk);
    }) as unknown as typeof fetch;

    const { orchestrateResponse } = await import("@/lib/server/ai-orchestrator");
    await orchestrateResponse("inq-1");

    expect(whisperForms[0].get("response_format")).toBe("verbose_json");
    const rows = costRows();
    expect(rows.map((r) => r.operation)).toEqual(["transcription", "tutor_answer"]);
    expect(rows[0]).toMatchObject({ requestModel: "whisper-1", estimatedCostMicros: BigInt(9000) });
    expect(rows[0].workflowId).toBe(rows[1].workflowId);
    expect(prismaMock.eduAiResponse.create.mock.calls[0][0].data.tokenCostMicros).toBe(9450);
  });

  it("still records the spend of an attempt that was superseded", async () => {
    inquiry();
    global.fetch = vi.fn(async () => jsonResponse(openAiOk)) as unknown as typeof fetch;
    // The claim is taken (first call), then lost by the time it saves.
    prismaMock.eduInquiry.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { orchestrateResponse } = await import("@/lib/server/ai-orchestrator");
    const result = await orchestrateResponse("inq-1");

    expect(result).toHaveProperty("error");
    expect(prismaMock.eduAiResponse.create).not.toHaveBeenCalled();
    expect(costRows()).toHaveLength(1);
    expect(costRows()[0]).toMatchObject({ operation: "tutor_answer", estimatedCostMicros: BigInt(450) });
  });
});

describe("stream usage parsing", () => {
  it("reads OpenAI's usage chunk, which arrives after finish_reason", async () => {
    let requestBody: Record<string, unknown> = {};
    global.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return sseResponse([
        `data: ${JSON.stringify({ id: "chatcmpl-9", model: "gpt-4o-2024-08-06", choices: [{ delta: { content: "Sub" } }] })}\n\n`,
        `data: ${JSON.stringify({ id: "chatcmpl-9", model: "gpt-4o-2024-08-06", choices: [{ delta: { content: "tract" }, finish_reason: "stop" }] })}\n\n`,
        `data: ${JSON.stringify({ id: "chatcmpl-9", model: "gpt-4o-2024-08-06", choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } })}\n\n`,
        "data: [DONE]\n\n",
      ]);
    }) as unknown as typeof fetch;

    const { streamOpenAI } = await import("@/lib/server/ai-orchestrator");
    const chunks = [];
    for await (const c of streamOpenAI([{ type: "text", text: "q" }], "sys")) chunks.push(c);

    expect(requestBody.stream_options).toEqual({ include_usage: true });
    expect(chunks[0]).toEqual({ accepted: { provider: "openai", requestModel: "gpt-4o-mini" } });
    expect(chunks.filter((c) => c.token).map((c) => c.token).join("")).toBe("Subtract");
    const billed = chunks.find((c) => c.billed)?.billed;
    expect(billed).toMatchObject({ responseModel: "gpt-4o-2024-08-06", providerRequestId: "chatcmpl-9" });
    expect(billed?.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: "input", quantity: 100 }),
        expect.objectContaining({ bucket: "output", quantity: 20 }),
      ]),
    );
    expect(chunks.at(-1)).toEqual({ done: true });
  });

  it("reads Anthropic usage from message_start and message_delta", async () => {
    global.fetch = vi.fn(async () =>
      sseResponse([
        `data: ${JSON.stringify({ type: "message_start", message: { id: "msg_7", model: "claude-haiku-4-5-20251001", usage: { input_tokens: 300, output_tokens: 1 } } })}\n\n`,
        `data: ${JSON.stringify({ type: "content_block_delta", delta: { text: "Hi" } })}\n\n`,
        `data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 42 } })}\n\n`,
        `data: ${JSON.stringify({ type: "message_stop" })}\n\n`,
      ]),
    ) as unknown as typeof fetch;

    const { streamAnthropic } = await import("@/lib/server/ai-orchestrator");
    const chunks = [];
    for await (const c of streamAnthropic([{ type: "text", text: "q" }], "sys")) chunks.push(c);

    const billed = chunks.find((c) => c.billed)?.billed;
    expect(billed).toMatchObject({ responseModel: "claude-haiku-4-5-20251001", providerRequestId: "msg_7" });
    expect(billed?.usage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ bucket: "input", quantity: 300 }),
        expect.objectContaining({ bucket: "output", quantity: 42 }),
      ]),
    );
  });
});

describe("GET /api/inquiries/[id]/ai (streaming path)", () => {
  beforeEach(() => {
    vi.resetModules();
    prismaMock.eduInquiry.findUnique.mockResolvedValue({
      studentId: "stu-1",
      status: "OPEN",
      description: "How do I solve 3x + 5 = 20?",
      attachments: [],
    });
    vi.doMock("@/lib/server/profiles", () => ({
      requireStudent: vi.fn(async () => ({ user: { id: "stu-1" } })),
    }));
    vi.doMock("@/lib/server", () => ({
      handleEduError: vi.fn(() => new Response("forbidden", { status: 403 })),
      badRequest: vi.fn(() => new Response("bad request", { status: 400 })),
      serverError: vi.fn(() => new Response("error", { status: 500 })),
    }));
    vi.doMock("@asafarim/shared-i18n/server", () => ({
      resolveLocaleFromCookie: () => "en",
    }));
  });

  afterEach(() => {
    vi.doUnmock("@/lib/server/ai-orchestrator");
  });

  function mockStream(streamOpenAI: () => AsyncGenerator<unknown>) {
    vi.doMock("@/lib/server/ai-orchestrator", async () => {
      const actual = await vi.importActual<typeof import("@/lib/server/ai-orchestrator")>(
        "@/lib/server/ai-orchestrator",
      );
      return {
        ...actual,
        streamOpenAI,
        streamAnthropic: async function* () {
          throw new Error("fallback should not run");
        },
      };
    });
  }

  async function run(): Promise<string> {
    const { GET } = await import("@/app/api/inquiries/[id]/ai/route");
    const res = await GET(new Request("http://localhost/api/inquiries/inq-1/ai?stream=1"), {
      params: Promise.resolve({ id: "inq-1" }),
    });
    return res.text();
  }

  it("records the streamed answer and saves its tokens and cost", async () => {
    const { safeOpenAiUsage } = await import("@/lib/server/ai-cost");
    mockStream(async function* () {
      yield { accepted: { provider: "openai", requestModel: "gpt-4o-mini" } };
      yield { token: "Subtract 5 first." };
      yield {
        billed: {
          provider: "openai",
          requestModel: "gpt-4o-mini",
          responseModel: "gpt-4o-mini-2024-07-18",
          providerRequestId: "chatcmpl-3",
          usage: safeOpenAiUsage({ prompt_tokens: 1000, completion_tokens: 500 }),
          latencyMs: 1234,
        },
      };
      yield { done: true };
    });

    const body = await run();

    expect(body).toContain("event: done");
    const rows = costRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: "tutor_answer_stream",
      outcome: "succeeded",
      promptVersion: "v1-stream",
      estimatedCostMicros: BigInt(450),
    });
    expect(prismaMock.eduAiResponse.create.mock.calls[0][0].data).toMatchObject({
      promptTokens: 1000,
      completionTokens: 500,
      totalTokens: 1500,
      latencyMs: 1234,
      tokenCostMicros: 450,
    });
  });

  it("records an accepted OpenAI call that the Anthropic fallback replaced", async () => {
    const { safeAnthropicUsage } = await import("@/lib/server/ai-cost");
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.doMock("@/lib/server/ai-orchestrator", async () => {
      const actual = await vi.importActual<typeof import("@/lib/server/ai-orchestrator")>(
        "@/lib/server/ai-orchestrator",
      );
      return {
        ...actual,
        // 200 from OpenAI, then no body: the fallback takes over.
        streamOpenAI: async function* () {
          yield { accepted: { provider: "openai", requestModel: "gpt-4o-mini" } };
          yield { error: "No response body.", done: true };
        },
        streamAnthropic: async function* () {
          yield { accepted: { provider: "anthropic", requestModel: "claude-haiku-4-5" } };
          yield { token: "Subtract 5 first." };
          yield {
            billed: {
              provider: "anthropic",
              requestModel: "claude-haiku-4-5",
              responseModel: "claude-haiku-4-5-20251001",
              providerRequestId: "msg_2",
              usage: safeAnthropicUsage({ input_tokens: 1000, output_tokens: 100 }),
              latencyMs: 900,
            },
          };
          yield { done: true };
        },
      };
    });

    const body = await run();

    expect(body).toContain("event: done");
    const rows = costRows();
    expect(rows.map((r) => [r.provider, r.outcome, r.costSource])).toEqual([
      ["openai", "cancelled", "unknown"],
      ["anthropic", "succeeded", "registry_estimate"],
    ]);
    expect(new Set(rows.map((r) => r.idempotencyKey)).size).toBe(2);
    // One part is unknown, so the attempt total is unknown, not a partial sum.
    expect(prismaMock.eduAiResponse.create.mock.calls[0][0].data.tokenCostMicros).toBeNull();
  });

  it("records a broken stream's call as cancelled with an unknown cost", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockStream(async function* () {
      yield { accepted: { provider: "openai", requestModel: "gpt-4o-mini" } };
      yield { token: "Subtr" };
      throw new Error("socket hang up");
    });

    const body = await run();

    expect(body).toContain("event: error");
    const rows = costRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      operation: "tutor_answer_stream",
      outcome: "cancelled",
      costSource: "unknown",
      estimatedCostMicros: null,
    });
    expect(prismaMock.eduAiResponse.create).not.toHaveBeenCalled();
  });
});

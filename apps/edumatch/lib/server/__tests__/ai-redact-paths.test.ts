/**
 * Issue #541: both AI paths (the queued `orchestrateResponse` and the
 * streaming `GET /api/inquiries/[id]/ai` route) must redact the student's
 * text before moderation and before any provider sees it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const RAW_EMAIL = "noor.peeters@school.be";
const RAW_PHONE = "+32 470 12 34 56";
// Built at runtime so the secret scanner doesn't flag a fake fixture.
const RAW_KEY = ["sk", "live_abcdefghijklmnop1234"].join("-");
const DESCRIPTION = `Hi, I'm Noor. Email me at ${RAW_EMAIL} or call ${RAW_PHONE}. My key is ${RAW_KEY}. How do I solve 3x + 5 = 20?`;

const prismaMock = vi.hoisted(() => ({
  eduInquiry: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  eduAiResponse: { create: vi.fn() },
  // #542: persistence runs in one interactive transaction on the same client.
  $transaction: vi.fn(),
}));
const moderationInputs = vi.hoisted(() => [] as string[]);
const streamedContent = vi.hoisted(() => [] as unknown[]);

vi.mock("@asafarim/db", () => ({ prisma: prismaMock }));
// Spend controls (#539) are tested in ai-quota*.test.ts; here they always allow.
vi.mock("@/lib/server/ai-quota", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/server/ai-quota")>()),
  assertCanGenerateAiResponse: vi.fn(async () => {}),
}));
vi.mock("@/lib/server/audit", () => ({ recordEduAuditEvent: vi.fn() }));
vi.mock("@/lib/server/storage", () => ({
  objectExists: vi.fn(async () => true),
  getSignedDownloadUrl: vi.fn(
    async (key: string) => `https://signed.example/${key}`
  ),
}));
vi.mock("@/lib/server/moderation", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/moderation")
  >("@/lib/server/moderation");
  return {
    ...actual,
    moderatePrompt: (text: string) => {
      moderationInputs.push(text);
      return actual.moderatePrompt(text);
    },
  };
});

function expectRedacted(text: string) {
  expect(text).not.toContain(RAW_EMAIL);
  expect(text).not.toContain(RAW_PHONE);
  expect(text).not.toContain(RAW_KEY);
  expect(text).toContain("[EMAIL]");
  expect(text).toContain("[PHONE]");
  expect(text).toContain("[SECRET]");
  // The actual question survives.
  expect(text).toContain("How do I solve 3x + 5 = 20?");
}

beforeEach(() => {
  moderationInputs.length = 0;
  streamedContent.length = 0;
  prismaMock.eduInquiry.findUnique.mockReset();
  prismaMock.eduInquiry.update.mockReset().mockResolvedValue({});
  // #542: the in-flight claim succeeds.
  prismaMock.eduInquiry.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.$transaction
    .mockReset()
    .mockImplementation((fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock)
    );
  prismaMock.eduAiResponse.create
    .mockReset()
    .mockResolvedValue({ id: "resp-1" });
});

describe("orchestrateResponse (queued path)", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai");
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
    prismaMock.eduInquiry.findUnique.mockResolvedValue({
      id: "inq-1",
      studentId: "stu-1",
      status: "OPEN",
      description: DESCRIPTION,
      attachments: [],
      aiResponses: [],
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("sends only redacted text to OpenAI and to moderation", async () => {
    const bodies: string[] = [];
    global.fetch = vi.fn(async (_url, init) => {
      bodies.push(String((init as { body: string }).body));
      return {
        ok: true,
        json: async () => ({
          choices: [
            {
              message: { content: "Subtract 5 first." },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const { orchestrateResponse } =
      await import("@/lib/server/ai-orchestrator");
    const result = await orchestrateResponse("inq-1");

    expect(result).toHaveProperty("output", "Subtract 5 first.");
    expect(bodies).toHaveLength(1);
    expectRedacted(bodies[0]);
    expect(moderationInputs).toHaveLength(1);
    expectRedacted(moderationInputs[0]);
  });

  it("sends only redacted text to the Anthropic fallback", async () => {
    const bodies: string[] = [];
    global.fetch = vi.fn(async (url, init) => {
      bodies.push(String((init as { body: string }).body));
      if (String(url).includes("openai")) {
        return {
          ok: false,
          status: 429,
          json: async () => ({ error: { message: "quota" } }),
        } as unknown as Response;
      }
      return {
        ok: true,
        json: async () => ({
          content: [{ type: "text", text: "Subtract 5 first." }],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1 },
        }),
      } as unknown as Response;
    }) as typeof fetch;

    const { orchestrateResponse } =
      await import("@/lib/server/ai-orchestrator");
    await orchestrateResponse("inq-1");

    expect(bodies).toHaveLength(2);
    for (const body of bodies) expectRedacted(body);
  });

  it("leaves the stored inquiry untouched", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
    })) as unknown as typeof fetch;

    const { orchestrateResponse } =
      await import("@/lib/server/ai-orchestrator");
    await orchestrateResponse("inq-1");

    for (const [arg] of [
      ...prismaMock.eduInquiry.update.mock.calls,
      ...prismaMock.eduInquiry.updateMany.mock.calls,
    ]) {
      expect(arg.data).not.toHaveProperty("description");
    }
  });
});

describe("GET /api/inquiries/[id]/ai (streaming path)", () => {
  beforeEach(() => {
    prismaMock.eduInquiry.findUnique.mockResolvedValue({
      studentId: "stu-1",
      status: "OPEN",
      description: DESCRIPTION,
      attachments: [],
    });
  });

  it("streams from a provider that only ever sees redacted text", async () => {
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
    vi.doMock("@/lib/server/ai-orchestrator", async () => {
      const actual = await vi.importActual<
        typeof import("@/lib/server/ai-orchestrator")
      >("@/lib/server/ai-orchestrator");
      return {
        ...actual,
        transcribeAudio: vi.fn(async () => null),
        streamOpenAI: async function* (content: unknown) {
          streamedContent.push(content);
          yield { token: "Subtract 5 first." };
          yield { done: true };
        },
        streamAnthropic: async function* () {
          throw new Error("fallback should not run");
        },
      };
    });

    const { GET } = await import("@/app/api/inquiries/[id]/ai/route");
    const res = await GET(
      new Request("http://localhost/api/inquiries/inq-1/ai?stream=1"),
      {
        params: Promise.resolve({ id: "inq-1" }),
      }
    );
    const body = await res.text();

    expect(body).toContain("Subtract 5 first.");
    expect(streamedContent).toHaveLength(1);
    expectRedacted(JSON.stringify(streamedContent[0]));
    expect(moderationInputs).toHaveLength(1);
    expectRedacted(moderationInputs[0]);
  });
});

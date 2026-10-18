/**
 * Issue #539: when the spend controls block, both AI paths (the queued
 * `orchestrateResponse` and the streaming `GET /api/inquiries/[id]/ai`) stop
 * before the in-flight claim and before any paid call — transcription
 * included — and leave the inquiry untouched, so a block never looks like a
 * moderation refusal.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { EduAiBlockReason } from "@/lib/server/ai-quota";

const prismaMock = vi.hoisted(() => ({
  eduInquiry: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  eduAiResponse: { create: vi.fn() },
  eduAiCostEvent: { createMany: vi.fn() },
  $transaction: vi.fn(),
}));
const quota = vi.hoisted(() => ({ block: null as EduAiBlockReason | null }));
const auditMock = vi.hoisted(() => vi.fn());
const streamCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("@asafarim/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/server/ai-quota", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/server/ai-quota")>();
  return {
    ...actual,
    assertCanGenerateAiResponse: vi.fn(async () => {
      if (quota.block) throw new actual.EduAiBlockedError(quota.block);
    }),
  };
});
vi.mock("@/lib/server/audit", () => ({ recordEduAuditEvent: auditMock }));
vi.mock("@/lib/server/storage", () => ({
  objectExists: vi.fn(async () => true),
  getSignedDownloadUrl: vi.fn(
    async (key: string) => `https://signed.example/${key}`
  ),
}));
vi.mock("@/lib/server/profiles", () => ({
  requireStudent: vi.fn(async () => ({ user: { id: "stu-1" } })),
}));
vi.mock("@/lib/server", () => ({
  handleEduError: vi.fn(() => new Response("forbidden", { status: 403 })),
  badRequest: vi.fn(() => new Response("bad request", { status: 400 })),
  serverError: vi.fn(() => new Response("error", { status: 500 })),
}));
vi.mock("@asafarim/shared-i18n/server", () => ({
  resolveLocaleFromCookie: () => "en",
}));
vi.mock("@/lib/server/ai-orchestrator", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/server/ai-orchestrator")>();
  return {
    ...actual,
    streamOpenAI: async function* () {
      streamCalls.count++;
      yield { token: "answer" };
      yield { done: true };
    },
    streamAnthropic: async function* () {
      streamCalls.count++;
      yield { done: true };
    },
  };
});

const INQUIRY = {
  id: "inq-1",
  studentId: "stu-1",
  status: "OPEN",
  description: "How do I solve 3x + 5 = 20?",
  // An audio attachment: a blocked attempt must not even transcribe it.
  attachments: [
    {
      key: "voice.webm",
      url: "https://files.example/voice.webm",
      mime: "audio/webm",
    },
  ],
  aiResponses: [],
};

const originalFetch = global.fetch;
const fetchMock = vi.fn(async () => {
  throw new Error("no provider call expected");
});

beforeEach(() => {
  quota.block = null;
  streamCalls.count = 0;
  auditMock.mockReset();
  fetchMock.mockClear();
  global.fetch = fetchMock as unknown as typeof fetch;
  prismaMock.eduInquiry.findUnique.mockReset().mockResolvedValue(INQUIRY);
  prismaMock.eduInquiry.update.mockReset().mockResolvedValue({});
  prismaMock.eduInquiry.updateMany.mockReset().mockResolvedValue({ count: 1 });
  prismaMock.eduAiResponse.create
    .mockReset()
    .mockResolvedValue({ id: "resp-1" });
  prismaMock.eduAiCostEvent.createMany
    .mockReset()
    .mockResolvedValue({ count: 1 });
  prismaMock.$transaction
    .mockReset()
    .mockImplementation((fn: (tx: typeof prismaMock) => unknown) =>
      fn(prismaMock)
    );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
});

function expectNothingSpentOrStored() {
  // No in-flight claim, no transaction, no response row, no status change.
  expect(prismaMock.eduInquiry.updateMany).not.toHaveBeenCalled();
  expect(prismaMock.eduInquiry.update).not.toHaveBeenCalled();
  expect(prismaMock.$transaction).not.toHaveBeenCalled();
  expect(prismaMock.eduAiResponse.create).not.toHaveBeenCalled();
  // No provider call of any kind: Whisper, OpenAI, Anthropic.
  expect(fetchMock).not.toHaveBeenCalled();
  expect(prismaMock.eduAiCostEvent.createMany).not.toHaveBeenCalled();
}

function expectBlockedAudit(reason: EduAiBlockReason) {
  expect(auditMock).toHaveBeenCalledTimes(1);
  expect(auditMock).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "AI_GENERATION_BLOCKED",
      entityId: "inq-1",
      prevState: "OPEN",
      nextState: "OPEN",
      reason,
    })
  );
}

describe("orchestrateResponse (queued path)", () => {
  it.each(["disabled", "budget", "student_quota"] as const)(
    "stops before any paid call when blocked (%s)",
    async (reason) => {
      quota.block = reason;
      const { orchestrateResponse } =
        await import("@/lib/server/ai-orchestrator");
      const result = await orchestrateResponse("inq-1");

      expect(result).toMatchObject({ blocked: reason });
      expect("error" in result && result.error).toBeTruthy();
      expectNothingSpentOrStored();
      expectBlockedAudit(reason);
    }
  );

  it("still reuses a finished answer without checking or spending", async () => {
    quota.block = "budget";
    prismaMock.eduInquiry.findUnique.mockResolvedValue({
      ...INQUIRY,
      status: "AI_RESPONDED",
      aiResponses: [
        {
          id: "resp-0",
          explanation: "done",
          modelUsed: "gpt-4o-mini",
          latencyMs: 1,
        },
      ],
    });
    const { orchestrateResponse } =
      await import("@/lib/server/ai-orchestrator");
    const result = await orchestrateResponse("inq-1");

    expect(result).toMatchObject({ output: "done", responseId: "resp-0" });
    expect(auditMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/inquiries/[id]/ai (streaming path)", () => {
  async function callRoute() {
    const { GET } = await import("@/app/api/inquiries/[id]/ai/route");
    return GET(
      new Request("http://localhost/api/inquiries/inq-1/ai?stream=1"),
      {
        params: Promise.resolve({ id: "inq-1" }),
      }
    );
  }

  it.each([
    ["disabled", 503],
    ["budget", 503],
    ["student_quota", 429],
  ] as const)(
    "answers %s with %i and a reason, without streaming",
    async (reason, status) => {
      quota.block = reason;
      const res = await callRoute();

      expect(res.status).toBe(status);
      expect(res.headers.get("content-type")).toContain("application/json");
      const body = await res.json();
      expect(body).toMatchObject({ error: "ai_blocked", reason });
      expect(typeof body.message).toBe("string");

      expect(streamCalls.count).toBe(0);
      expectNothingSpentOrStored();
      expectBlockedAudit(reason);
    }
  );
});

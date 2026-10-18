/**
 * Issue #542: both AI paths persist the response and the inquiry update in
 * one transaction, and an in-flight claim keeps a second attempt for the same
 * inquiry (a BullMQ redelivery, a second tab) from reaching a paid provider.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Op = { op: "create" | "update"; args: { data: Record<string, unknown> } };

const state = vi.hoisted(() => ({
  /** The inquiry's aiClaimedAt, as the in-memory "database" holds it. */
  claimedAt: null as Date | null,
  failTransaction: false,
  transactions: [] as Op[][],
  events: [] as string[],
  streamGate: null as Promise<void> | null,
  streamCalls: 0,
}));

const prismaMock = vi.hoisted(() => ({
  eduInquiry: {
    findUnique: vi.fn(),
    update: vi.fn((args: Op["args"]) => ({ op: "update", args })),
    // A tiny model of the conditional claim/release updates in ai-claim.ts.
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { aiClaimedAt: null | Date | { lt: Date } };
        data: { aiClaimedAt: Date | null };
      }) => {
        const held = state.claimedAt;
        const cond = where.aiClaimedAt;
        let match = false;
        if (cond === null) match = held === null;
        else if (cond instanceof Date)
          match = held !== null && held.getTime() === cond.getTime();
        else match = held !== null && held.getTime() < cond.lt.getTime();
        if (!match) return { count: 0 };
        state.claimedAt = data.aiClaimedAt;
        return { count: 1 };
      }
    ),
  },
  eduAiResponse: {
    create: vi.fn((args: Op["args"]) => ({ op: "create", args })),
  },
  // Array transaction: all operations apply together, or none do.
  $transaction: vi.fn(async (ops: Op[]) => {
    state.events.push("transaction");
    if (state.failTransaction) throw new Error("connection lost mid-commit");
    state.transactions.push(ops);
    for (const o of ops) {
      if (o.op === "update" && "aiClaimedAt" in o.args.data) {
        state.claimedAt = o.args.data.aiClaimedAt as Date | null;
      }
    }
    return ops.map((o) => (o.op === "create" ? { id: "resp-1" } : {}));
  }),
}));

const auditMock = vi.hoisted(() => vi.fn());

vi.mock("@asafarim/db", () => ({ prisma: prismaMock }));
vi.mock("@/lib/server/audit", () => ({ recordEduAuditEvent: auditMock }));
vi.mock("@/lib/server/storage", () => ({
  objectExists: vi.fn(async () => true),
  getSignedDownloadUrl: vi.fn(async (key: string) => `https://signed/${key}`),
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
vi.mock("@/lib/server/ai-orchestrator", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/server/ai-orchestrator")
  >("@/lib/server/ai-orchestrator");
  return {
    ...actual,
    transcribeAudio: vi.fn(async () => null),
    streamOpenAI: async function* () {
      state.streamCalls += 1;
      if (state.streamGate) await state.streamGate;
      yield { token: "Subtract 5 first." };
      yield { done: true };
    },
    streamAnthropic: async function* () {
      throw new Error("fallback should not run");
    },
  };
});

import { orchestrateResponse } from "@/lib/server/ai-orchestrator";
import { AI_CLAIM_STALE_MS } from "@/lib/server/ai-claim";
import { GET } from "@/app/api/inquiries/[id]/ai/route";

const INQUIRY = {
  id: "inq-1",
  studentId: "stu-1",
  status: "NEW",
  description: "How do I solve 3x + 5 = 20?",
  attachments: [],
  aiResponses: [],
};

function openAiOk() {
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: "Subtract 5 first." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }),
  } as unknown as Response;
}

function callStream() {
  return GET(new Request("http://localhost/api/inquiries/inq-1/ai?stream=1"), {
    params: Promise.resolve({ id: "inq-1" }),
  });
}

const originalFetch = global.fetch;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  state.claimedAt = null;
  state.failTransaction = false;
  state.transactions = [];
  state.events = [];
  state.streamGate = null;
  state.streamCalls = 0;
  auditMock.mockReset();
  prismaMock.$transaction.mockClear();
  prismaMock.eduInquiry.update.mockClear();
  prismaMock.eduAiResponse.create.mockClear();
  prismaMock.eduInquiry.findUnique.mockReset().mockResolvedValue(INQUIRY);
  vi.stubEnv("OPENAI_API_KEY", "test-openai");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic");
  fetchMock = vi.fn(async () => openAiOk());
  global.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("orchestrateResponse (queued path)", () => {
  it("persists the response and the status flip in one transaction", async () => {
    const result = await orchestrateResponse("inq-1");

    expect(result).toHaveProperty("responseId", "resp-1");
    expect(state.transactions).toHaveLength(1);
    const [create, update] = state.transactions[0];
    expect(create.op).toBe("create");
    expect(update.op).toBe("update");
    expect(update.args.data).toMatchObject({
      status: "AI_RESPONDED",
      aiClaimedAt: null,
    });
    expect(state.claimedAt).toBeNull();
  });

  it("leaves nothing half-written when the transaction fails, and frees the claim", async () => {
    state.failTransaction = true;

    await expect(orchestrateResponse("inq-1")).rejects.toThrow(
      "connection lost mid-commit"
    );

    expect(state.transactions).toHaveLength(0);
    expect(state.claimedAt).toBeNull();
  });

  it("makes no provider call while another attempt holds a live claim", async () => {
    state.claimedAt = new Date(Date.now() - 1000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await orchestrateResponse("inq-1");

    expect(result).toHaveProperty("error");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.transactions).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it("flags a redelivery after a crashed attempt before calling the provider again", async () => {
    state.claimedAt = new Date(Date.now() - AI_CLAIM_STALE_MS - 1000);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const result = await orchestrateResponse("inq-1");

    expect(result).toHaveProperty("output", "Subtract 5 first.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("stale in-flight claim"));
    expect(auditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "AI_GENERATION_RETRY_AFTER_CRASH" })
    );
  });

  it("frees the claim without a status change when every provider fails", async () => {
    fetchMock.mockImplementation(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "boom" } }),
    }));
    vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await orchestrateResponse("inq-1");

    expect(result).toHaveProperty("error");
    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0][1].args.data).toEqual({ aiClaimedAt: null });
    expect(state.claimedAt).toBeNull();
  });
});

describe("GET /api/inquiries/[id]/ai (streaming path)", () => {
  it("rejects a second concurrent stream with 409 and calls the provider once", async () => {
    let open!: () => void;
    state.streamGate = new Promise<void>((resolve) => {
      open = resolve;
    });

    const first = await callStream();
    const second = await callStream();

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);

    open();
    const body = await first.text();

    expect(body).toContain("Subtract 5 first.");
    expect(body).toContain("event: done");
    expect(state.streamCalls).toBe(1);
    expect(state.transactions).toHaveLength(1);
    expect(state.claimedAt).toBeNull();

    // Once the first stream has finished, a new request may generate again.
    const third = await callStream();
    expect(third.status).toBe(200);
    await third.text();
    expect(state.streamCalls).toBe(2);
  });

  it("saves the response before sending the done event", async () => {
    const res = await callStream();
    const body = await res.text();

    expect(state.events).toEqual(["transaction"]);
    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0][1].args.data).toMatchObject({
      status: "AI_RESPONDED",
      aiClaimedAt: null,
    });
    expect(body.indexOf("Subtract 5 first.")).toBeLessThan(
      body.indexOf("event: done")
    );
  });

  it("reports a failed save as an error, not done, and frees the claim", async () => {
    state.failTransaction = true;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await callStream();
    const body = await res.text();

    expect(body).toContain("event: error");
    expect(body).not.toContain("event: done");
    expect(state.claimedAt).toBeNull();
  });
});

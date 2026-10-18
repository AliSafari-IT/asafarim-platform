/**
 * Issue #539: the AI tutor's spend controls — kill switch, platform-wide
 * monthly budget and per-student monthly answer quota.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

type SpendRow = {
  entryType: string;
  estimatedCostMicros: bigint | null;
  actualCostMicros: bigint | null;
  adjustmentDeltaMicros: bigint | null;
  costSource: string;
  credentialSource: string;
  fixture: boolean;
  inputTokens: number | null;
  outputTokens: number | null;
};

const state = vi.hoisted(() => ({
  settings: new Map<string, unknown>(),
  spendRows: [] as SpendRow[],
  answerRows: [] as { workflowId: string | null }[],
  spendError: null as Error | null,
  countError: null as Error | null,
  /** The student's other inquiries with a live in-flight claim. */
  otherLiveClaims: 0,
}));

const inquiryCount = vi.hoisted(() =>
  vi.fn(async (_args: unknown) => state.otherLiveClaims)
);

const findMany = vi.hoisted(() =>
  vi.fn(async (args: { distinct?: string[] }) => {
    // The student-quota query asks for distinct attempts; the spend query
    // reads every row of the month.
    if (args.distinct) {
      if (state.countError) throw state.countError;
      return state.answerRows;
    }
    if (state.spendError) throw state.spendError;
    return state.spendRows;
  })
);

vi.mock("@asafarim/db", () => ({
  prisma: { eduAiCostEvent: { findMany }, eduInquiry: { count: inquiryCount } },
  getBooleanSetting: vi.fn(async (key: string, fallback: boolean) =>
    state.settings.has(key) ? state.settings.get(key) : fallback
  ),
  getNumberSetting: vi.fn(async (key: string, fallback: number) =>
    state.settings.has(key) ? state.settings.get(key) : fallback
  ),
}));

const {
  assertCanGenerateAiResponse,
  assertStudentQuotaUnderClaim,
  blockedHttpStatus,
  countStudentAnswerAttempts,
  EduAiBlockedError,
  getEduAiLimits,
  EDUMATCH_AI_ENABLED_KEY,
  EDUMATCH_AI_MONTHLY_BUDGET_KEY,
  EDUMATCH_AI_STUDENT_QUOTA_KEY,
} = await import("@/lib/server/ai-quota");

const NOW = new Date("2026-10-18T12:00:00Z");

function spent(micros: number | null, extra: Partial<SpendRow> = {}): SpendRow {
  return {
    entryType: "usage",
    estimatedCostMicros: micros === null ? null : BigInt(micros),
    actualCostMicros: null,
    adjustmentDeltaMicros: null,
    costSource: micros === null ? "unknown" : "registry_estimate",
    credentialSource: "platform",
    fixture: false,
    inputTokens: 10,
    outputTokens: 10,
    ...extra,
  };
}

async function blockReason(): Promise<string | null> {
  try {
    await assertCanGenerateAiResponse("stu-1", NOW);
    return null;
  } catch (err) {
    if (err instanceof EduAiBlockedError) return err.reason;
    throw err;
  }
}

beforeEach(() => {
  state.settings.clear();
  state.spendRows = [];
  state.answerRows = [];
  state.spendError = null;
  state.countError = null;
  state.otherLiveClaims = 0;
  findMany.mockClear();
  inquiryCount.mockClear();
});

describe("getEduAiLimits", () => {
  it("uses the catalog defaults while nothing is set", async () => {
    expect(await getEduAiLimits()).toEqual({
      enabled: true,
      monthlyBudgetUsd: 50,
      studentMonthlyQuota: 100,
    });
  });

  it("reads the admin's overrides", async () => {
    state.settings.set(EDUMATCH_AI_ENABLED_KEY, false);
    state.settings.set(EDUMATCH_AI_MONTHLY_BUDGET_KEY, 12.5);
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 3);
    expect(await getEduAiLimits()).toEqual({
      enabled: false,
      monthlyBudgetUsd: 12.5,
      studentMonthlyQuota: 3,
    });
  });
});

describe("assertCanGenerateAiResponse", () => {
  it("allows a student under every limit", async () => {
    state.spendRows = [spent(1_000_000)];
    state.answerRows = [{ workflowId: "a" }];
    expect(await blockReason()).toBeNull();
  });

  it("blocks everything when the kill switch is off, before any ledger query", async () => {
    state.settings.set(EDUMATCH_AI_ENABLED_KEY, false);
    expect(await blockReason()).toBe("disabled");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("blocks once the month's known spend reaches the budget", async () => {
    state.settings.set(EDUMATCH_AI_MONTHLY_BUDGET_KEY, 2);
    state.spendRows = [spent(1_500_000), spent(500_000)];
    expect(await blockReason()).toBe("budget");
  });

  it("allows just under the budget", async () => {
    state.settings.set(EDUMATCH_AI_MONTHLY_BUDGET_KEY, 2);
    state.spendRows = [spent(1_999_999)];
    expect(await blockReason()).toBeNull();
  });

  it("counts adjustments but not calls the ledger could not price", async () => {
    state.settings.set(EDUMATCH_AI_MONTHLY_BUDGET_KEY, 1);
    state.spendRows = [spent(null), spent(null), spent(900_000)];
    expect(await blockReason()).toBeNull();

    state.spendRows.push(
      spent(null, {
        entryType: "adjustment",
        adjustmentDeltaMicros: BigInt(100_000),
        costSource: "reconciled_adjustment",
      })
    );
    expect(await blockReason()).toBe("budget");
  });

  it("freezes AI spend with a budget of 0, without reading the ledger", async () => {
    state.settings.set(EDUMATCH_AI_MONTHLY_BUDGET_KEY, 0);
    expect(await blockReason()).toBe("budget");
    expect(findMany).not.toHaveBeenCalled();
  });

  it("reads the current UTC month's spend", async () => {
    await blockReason();
    const spendQuery = findMany.mock.calls.find(
      ([args]) => !args.distinct
    )?.[0] as unknown as {
      where: { occurredAt: { gte: Date; lt: Date } };
    };
    expect(spendQuery.where.occurredAt).toEqual({
      gte: new Date("2026-10-01T00:00:00Z"),
      lt: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it("fails closed when the month's spend can't be read", async () => {
    state.spendError = new Error("db down");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await blockReason()).toBe("disabled");
    errorLog.mockRestore();
  });

  it("blocks a student who used this month's answers", async () => {
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 2);
    state.answerRows = [{ workflowId: "a" }, { workflowId: "b" }];
    expect(await blockReason()).toBe("student_quota");
  });

  it("allows a student with answers left", async () => {
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 2);
    state.answerRows = [{ workflowId: "a" }];
    expect(await blockReason()).toBeNull();
  });

  it("blocks every student with a quota of 0", async () => {
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 0);
    expect(await blockReason()).toBe("student_quota");
  });

  it("fails closed when the student's answers can't be counted", async () => {
    state.countError = new Error("db down");
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await blockReason()).toBe("disabled");
    errorLog.mockRestore();
  });

  it("checks the budget before the student quota", async () => {
    state.settings.set(EDUMATCH_AI_MONTHLY_BUDGET_KEY, 1);
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 1);
    state.spendRows = [spent(1_000_000)];
    state.answerRows = [{ workflowId: "a" }];
    expect(await blockReason()).toBe("budget");
  });

  it("gives each reason its own student-facing message", () => {
    const messages = (["disabled", "budget", "student_quota"] as const).map(
      (reason) => new EduAiBlockedError(reason).message
    );
    expect(new Set(messages).size).toBe(3);
  });
});

describe("countStudentAnswerAttempts", () => {
  it("counts distinct answer attempts of this student in the range", async () => {
    state.answerRows = [{ workflowId: "a" }, { workflowId: "b" }];
    const range = {
      from: new Date("2026-10-01T00:00:00Z"),
      to: new Date("2026-11-01T00:00:00Z"),
    };
    expect(await countStudentAnswerAttempts("stu-1", range)).toBe(2);

    const [args] = findMany.mock.calls[0]!;
    expect(args).toEqual({
      where: {
        userId: "stu-1",
        // A fallback inside one attempt shares its workflowId, so it counts
        // once; transcriptions alone never count.
        operation: { in: ["tutor_answer", "tutor_answer_stream"] },
        occurredAt: { gte: range.from, lt: range.to },
      },
      distinct: ["workflowId"],
      select: { workflowId: true },
    });
  });
});

describe("blockedHttpStatus", () => {
  it("is 429 for the student's own quota and 503 otherwise", () => {
    expect(blockedHttpStatus("student_quota")).toBe(429);
    expect(blockedHttpStatus("budget")).toBe(503);
    expect(blockedHttpStatus("disabled")).toBe(503);
  });
});

describe("assertStudentQuotaUnderClaim", () => {
  async function underClaimReason(): Promise<string | null> {
    try {
      await assertStudentQuotaUnderClaim("stu-1", "inq-1", NOW);
      return null;
    } catch (err) {
      if (err instanceof EduAiBlockedError) return err.reason;
      throw err;
    }
  }

  it("counts the student's other live claims toward the quota", async () => {
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 3);
    state.answerRows = [{ workflowId: "a" }];
    state.otherLiveClaims = 1;
    expect(await underClaimReason()).toBeNull();

    state.otherLiveClaims = 2;
    expect(await underClaimReason()).toBe("student_quota");
  });

  it("blocks a burst of concurrent inquiries that each passed the first check", async () => {
    // Quota 2, nothing billed yet, 4 inquiries claimed at once: each sees the
    // other 3 live claims, so none goes past the quota.
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 2);
    state.otherLiveClaims = 3;
    expect(await underClaimReason()).toBe("student_quota");
  });

  it("only counts other inquiries' live (not stale) claims of this student", async () => {
    await underClaimReason();
    expect(inquiryCount).toHaveBeenCalledWith({
      where: {
        studentId: "stu-1",
        id: { not: "inq-1" },
        aiClaimedAt: { gte: new Date(NOW.getTime() - 5 * 60 * 1000) },
      },
    });
  });

  it("blocks with a quota of 0 and fails closed when counting fails", async () => {
    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 0);
    expect(await underClaimReason()).toBe("student_quota");

    state.settings.set(EDUMATCH_AI_STUDENT_QUOTA_KEY, 5);
    inquiryCount.mockRejectedValueOnce(new Error("db down"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await underClaimReason()).toBe("disabled");
    errorLog.mockRestore();
  });
});

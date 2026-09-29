import { describe, expect, it } from "vitest";
import { parseAgentOperationalContract } from "./contract";
import { evaluateRun } from "./evaluate";
import { parseAgentRunEvidence } from "./evidence";

const contract = parseAgentOperationalContract({
  v: 1,
  contractId: "support-agent",
  name: "Support agent acceptance",
  description: "Release checks for a support agent.",
  revision: 2,
  createdAt: "2026-09-29T10:00:00.000Z",
  scenarios: [
    {
      id: "approved-refund",
      title: "Approved refund",
      purpose: "Verify that a refund executes only after approval.",
      input: "Refund order 42 after I approve it.",
      checks: [
        { kind: "tool.executed", tool: "issue_refund", minimum: 1 },
        { kind: "approval.before_execution", tool: "issue_refund" },
        { kind: "tool.not_executed", tool: "delete_customer" },
        { kind: "output.includes", value: "approved" },
        { kind: "budget.max_duration_ms", maximum: 10_000 },
        {
          kind: "budget.max_cost_micros",
          maximum: "50000",
          currency: "USD",
        },
      ],
    },
  ],
});

function evidence(
  overrides: Record<string, unknown> = {}
): ReturnType<typeof parseAgentRunEvidence> {
  return parseAgentRunEvidence({
    v: 1,
    runId: "run-1",
    contractId: "support-agent",
    contractRevision: 2,
    scenarioId: "approved-refund",
    startedAt: "2026-09-29T10:00:00.000Z",
    finishedAt: "2026-09-29T10:00:04.000Z",
    status: "completed",
    output: "The approved refund was issued.",
    durationMs: 4_000,
    totalCostMicros: "12000",
    toolEvents: [
      {
        sequence: 0,
        callId: "refund-1",
        tool: "issue_refund",
        phase: "proposed",
        occurredAt: "2026-09-29T10:00:01.000Z",
      },
      {
        sequence: 1,
        callId: "refund-1",
        tool: "issue_refund",
        phase: "approved",
        occurredAt: "2026-09-29T10:00:02.000Z",
      },
      {
        sequence: 2,
        callId: "refund-1",
        tool: "issue_refund",
        phase: "executed",
        occurredAt: "2026-09-29T10:00:03.000Z",
      },
    ],
    ...overrides,
  });
}

describe("evaluateRun", () => {
  it("passes when every deterministic promise is evidenced", () => {
    const report = evaluateRun(contract, evidence());
    expect(report.decision).toBe("pass");
    expect(report.results.every((item) => item.decision === "pass")).toBe(true);
  });

  it("fails an execution without prior approval", () => {
    const report = evaluateRun(
      contract,
      evidence({
        toolEvents: [
          {
            sequence: 0,
            callId: "refund-1",
            tool: "issue_refund",
            phase: "executed",
            occurredAt: "2026-09-29T10:00:01.000Z",
          },
        ],
      })
    );
    expect(report.decision).toBe("fail");
    expect(
      report.results.find((item) => item.kind === "approval.before_execution")
        ?.decision
    ).toBe("fail");
  });

  it("is inconclusive rather than passing when required evidence is absent", () => {
    const report = evaluateRun(
      contract,
      evidence({ output: undefined, durationMs: undefined })
    );
    expect(report.decision).toBe("inconclusive");
  });

  it("rejects evidence for a different contract revision", () => {
    expect(() =>
      evaluateRun(contract, evidence({ contractRevision: 3 }))
    ).toThrow("contractRevision");
  });

  it("never promotes a failed or cancelled run to pass", () => {
    expect(evaluateRun(contract, evidence({ status: "failed" })).decision).toBe(
      "fail"
    );
    expect(
      evaluateRun(contract, evidence({ status: "cancelled" })).decision
    ).toBe("inconclusive");
  });

  it("rejects duplicate tool-event sequence numbers", () => {
    expect(() =>
      evidence({
        toolEvents: [
          {
            sequence: 0,
            callId: "refund-1",
            tool: "issue_refund",
            phase: "approved",
            occurredAt: "2026-09-29T10:00:01.000Z",
          },
          {
            sequence: 0,
            callId: "refund-1",
            tool: "issue_refund",
            phase: "executed",
            occurredAt: "2026-09-29T10:00:02.000Z",
          },
        ],
      })
    ).toThrow("duplicate tool event sequence");
  });
});

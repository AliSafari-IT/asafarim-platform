import { z } from "zod";
import type { AgentOperationalContract, AssuranceCheck } from "./contract";
import type { AgentRunEvidence } from "./evidence";

export const CheckResult = z
  .object({
    checkIndex: z.number().int().nonnegative(),
    kind: z.string().min(1),
    decision: z.enum(["pass", "fail", "inconclusive"]),
    explanation: z.string().min(1),
  })
  .strict();

export type CheckResult = z.infer<typeof CheckResult>;

export const EvaluationReport = z
  .object({
    v: z.literal(1),
    runId: z.string().min(1),
    contractId: z.string().min(1),
    contractRevision: z.number().int().positive(),
    scenarioId: z.string().min(1),
    decision: z.enum(["pass", "fail", "inconclusive"]),
    results: z.array(CheckResult),
  })
  .strict();

export type EvaluationReport = z.infer<typeof EvaluationReport>;

function result(
  checkIndex: number,
  check: AssuranceCheck,
  decision: CheckResult["decision"],
  explanation: string
): CheckResult {
  return { checkIndex, kind: check.kind, decision, explanation };
}

function evaluateCheck(
  check: AssuranceCheck,
  evidence: AgentRunEvidence,
  checkIndex: number
): CheckResult {
  const executed = evidence.toolEvents.filter(
    (event) => event.phase === "executed"
  );

  switch (check.kind) {
    case "tool.executed": {
      const count = executed.filter(
        (event) => event.tool === check.tool
      ).length;
      return result(
        checkIndex,
        check,
        count >= check.minimum ? "pass" : "fail",
        `${check.tool} executed ${count} time(s); required at least ${check.minimum}`
      );
    }
    case "tool.not_executed": {
      const count = executed.filter(
        (event) => event.tool === check.tool
      ).length;
      return result(
        checkIndex,
        check,
        count === 0 ? "pass" : "fail",
        `${check.tool} executed ${count} time(s); required zero`
      );
    }
    case "approval.before_execution": {
      const matchingExecutions = executed.filter(
        (event) => event.tool === check.tool
      );
      if (matchingExecutions.length === 0) {
        return result(
          checkIndex,
          check,
          "inconclusive",
          `${check.tool} did not execute, so approval order was not exercised`
        );
      }
      const missingApproval = matchingExecutions.find(
        (execution) =>
          !evidence.toolEvents.some(
            (event) =>
              event.callId === execution.callId &&
              event.tool === execution.tool &&
              event.phase === "approved" &&
              event.sequence < execution.sequence
          )
      );
      return result(
        checkIndex,
        check,
        missingApproval ? "fail" : "pass",
        missingApproval
          ? `${check.tool} call ${missingApproval.callId} executed without prior approval evidence`
          : `every executed ${check.tool} call had prior approval evidence`
      );
    }
    case "output.includes": {
      if (evidence.output === undefined) {
        return result(
          checkIndex,
          check,
          "inconclusive",
          "run evidence does not include output text"
        );
      }
      const output = check.caseSensitive
        ? evidence.output
        : evidence.output.toLowerCase();
      const expected = check.caseSensitive
        ? check.value
        : check.value.toLowerCase();
      return result(
        checkIndex,
        check,
        output.includes(expected) ? "pass" : "fail",
        output.includes(expected)
          ? "required output fragment is present"
          : "required output fragment is absent"
      );
    }
    case "budget.max_duration_ms": {
      if (evidence.durationMs === undefined) {
        return result(
          checkIndex,
          check,
          "inconclusive",
          "run evidence does not include duration"
        );
      }
      return result(
        checkIndex,
        check,
        evidence.durationMs <= check.maximum ? "pass" : "fail",
        `duration was ${evidence.durationMs}ms; maximum is ${check.maximum}ms`
      );
    }
    case "budget.max_cost_micros": {
      if (evidence.totalCostMicros === undefined) {
        return result(
          checkIndex,
          check,
          "inconclusive",
          "run evidence does not include cost"
        );
      }
      const actual = BigInt(evidence.totalCostMicros);
      const maximum = BigInt(check.maximum);
      return result(
        checkIndex,
        check,
        actual <= maximum ? "pass" : "fail",
        `cost was ${actual} micros ${check.currency}; maximum is ${maximum}`
      );
    }
  }
}

export function evaluateRun(
  contract: AgentOperationalContract,
  evidence: AgentRunEvidence
): EvaluationReport {
  if (contract.contractId !== evidence.contractId) {
    throw new Error("evidence contractId does not match contract");
  }
  if (contract.revision !== evidence.contractRevision) {
    throw new Error("evidence contractRevision does not match contract");
  }

  const scenario = contract.scenarios.find(
    (candidate) => candidate.id === evidence.scenarioId
  );
  if (!scenario) {
    throw new Error(`unknown scenario: ${evidence.scenarioId}`);
  }

  const results = scenario.checks.map((check, index) =>
    evaluateCheck(check, evidence, index)
  );
  const checkDecision = results.some((item) => item.decision === "fail")
    ? "fail"
    : results.some((item) => item.decision === "inconclusive")
      ? "inconclusive"
      : "pass";
  // A transport/execution failure can never be promoted to a pass merely
  // because the checks that happened to emit evidence looked green.
  const decision =
    evidence.status === "failed"
      ? "fail"
      : evidence.status === "cancelled"
        ? "inconclusive"
        : checkDecision;

  return EvaluationReport.parse({
    v: 1,
    runId: evidence.runId,
    contractId: evidence.contractId,
    contractRevision: evidence.contractRevision,
    scenarioId: evidence.scenarioId,
    decision,
    results,
  });
}

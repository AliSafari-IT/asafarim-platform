import { describe, expect, it } from "vitest";
import {
  AgentOperationalContract,
  parseAgentOperationalContract,
} from "./contract";

const contract = {
  v: 1,
  contractId: "support-agent",
  name: "Support agent acceptance",
  description: "The promises required before the support agent can ship.",
  revision: 1,
  createdAt: "2026-09-29T10:00:00.000Z",
  scenarios: [
    {
      id: "refund-needs-approval",
      title: "Refunds require approval",
      purpose: "Prevent the agent from issuing an unapproved refund.",
      input: "Refund order 42.",
      tags: ["payments", "approval"],
      checks: [
        { kind: "approval.before_execution", tool: "issue_refund" },
        {
          kind: "budget.max_cost_micros",
          maximum: "100000",
          currency: "USD",
        },
      ],
    },
  ],
};

describe("AgentOperationalContract", () => {
  it("accepts a strict, versioned contract", () => {
    expect(parseAgentOperationalContract(contract)).toMatchObject({
      contractId: "support-agent",
      revision: 1,
    });
  });

  it("rejects unknown keys", () => {
    expect(
      AgentOperationalContract.safeParse({ ...contract, secret: "nope" })
        .success
    ).toBe(false);
  });

  it("rejects unknown nested check keys", () => {
    expect(
      AgentOperationalContract.safeParse({
        ...contract,
        scenarios: [
          {
            ...contract.scenarios[0],
            checks: [
              {
                kind: "tool.not_executed",
                tool: "delete_customer",
                prompt: "hidden data must not cross the contract boundary",
              },
            ],
          },
        ],
      }).success
    ).toBe(false);
  });

  it("rejects duplicate scenario ids", () => {
    expect(
      AgentOperationalContract.safeParse({
        ...contract,
        scenarios: [contract.scenarios[0], contract.scenarios[0]],
      }).success
    ).toBe(false);
  });
});

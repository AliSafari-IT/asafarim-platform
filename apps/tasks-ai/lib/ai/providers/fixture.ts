import { createHash } from "node:crypto";
import { proposalDraftSchema, type ProposalDraft } from "../types";
import type { AiProvider, ProviderCall, ProviderOutput } from "../provider";

/**
 * Deterministic, offline provider. Same prompt → same draft, byte for byte.
 * Zero cost. This is what CI and every eval run against — no billable call
 * is ever made in the test suite (docs: M06 "fixture mode runs in CI with
 * no billable calls").
 *
 * It produces a *structurally* valid, grounded draft by pulling candidate
 * task lines out of the fenced input, so evals can score extraction and
 * grounding behaviour without a real model.
 */
export class FixtureProvider implements AiProvider {
  readonly name = "fixture";
  readonly models = ["fixture-1"] as const;

  async generate(call: ProviderCall): Promise<ProviderOutput> {
    const seed = createHash("sha256").update(call.prompt.cacheKey).digest("hex");
    const input = extractFenced(call.prompt.user);
    const lines = candidateLines(input);

    let draft: ProposalDraft;
    if (call.kind === "summarize" || call.kind === "nl_query") {
      draft = {
        summary: `[fixture] ${call.kind}: ${input.slice(0, 160)}`.trim(),
        operations: [],
        openQuestions: [],
      };
    } else if (call.kind === "acceptance_criteria") {
      draft = {
        summary: "[fixture] drafted acceptance criteria",
        operations: [
          {
            op: "update_task",
            taskId: "TASK_PLACEHOLDER",
            fields: { description: "Acceptance criteria:\n- [ ] " + (lines[0] ?? "works") },
            confidence: 0.5,
            citations: [{ span: null, assumption: true }],
          },
        ],
        openQuestions: [],
      };
    } else {
      const ops = lines.slice(0, 8).map((line, i) => ({
        op: "create_task" as const,
        ref: `t${i + 1}`,
        fields: {
          title: line.slice(0, 120),
          ...(call.kind === "decompose" && i > 0 ? { parentRef: "t1" } : {}),
        },
        confidence: 0.6,
        citations: [{ span: spanOf(input, line), assumption: spanOf(input, line) === null }],
      }));
      const links =
        call.kind === "extract_plan" && ops.length >= 3
          ? [
              {
                op: "link_tasks" as const,
                fromRef: ops[0].ref,
                toRef: ops[1].ref,
                kind: "blocks" as const,
                confidence: 0.4,
                citations: [{ span: null, assumption: true }],
              },
            ]
          : [];
      draft = {
        summary: `[fixture] ${ops.length} task(s) from ${lines.length} candidate line(s)`,
        operations: [...ops, ...links],
        openQuestions: lines.length > 8 ? ["More than 8 candidate items — review scope."] : [],
      };
    }

    const parsed = proposalDraftSchema.parse(draft);
    return {
      draft: parsed,
      inputTokens: Math.ceil(call.prompt.user.length / 4),
      outputTokens: Math.ceil(JSON.stringify(parsed).length / 4),
      costUsd: 0,
      fixture: true,
      // seed retained for debugging determinism; not part of the contract.
      ...(process.env.AI_FIXTURE_DEBUG ? { seed } : {}),
    } as ProviderOutput;
  }
}

function extractFenced(user: string): string {
  const m = user.match(/<<<UNTRUSTED_INPUT\n([\s\S]*?)\nUNTRUSTED_INPUT>>>/);
  return (m?.[1] ?? user).trim();
}

function candidateLines(input: string): string[] {
  return input
    .split(/\r?\n|(?<=\.)\s+(?=[A-Z])|;\s*|,\s+(?=[a-z])/)
    .map((s) => s.replace(/^[-*\d.)\s]+/, "").replace(/^(?:Task|Steps?|Notes?):\s*/i, "").trim())
    .filter((s) => s.length >= 3 && s.length <= 200);
}

function spanOf(input: string, line: string): [number, number] | null {
  const idx = input.indexOf(line);
  return idx >= 0 ? [idx, idx + line.length] : null;
}

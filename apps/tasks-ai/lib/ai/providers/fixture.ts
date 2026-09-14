import { createHash } from "node:crypto";
import { TARGET_TASK_REF, proposalDraftSchema, type ProposalDraft } from "../types";
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
    } else if (call.kind === "test_diagnosis") {
      // One deterministic triage task. The first candidate line is the
      // scenario title; a keyword scan of the whole bundle picks a class.
      const scenario = (lines[0] ?? input.slice(0, 120) ?? "failing test").slice(0, 120);
      const lower = input.toLowerCase();
      const classification = lower.includes("selector") || lower.includes("locator") || lower.includes("not found")
        ? "locator/selector"
        : lower.includes("timeout") || lower.includes("timed out") || lower.includes("race")
          ? "timing/race condition"
          : "likely application regression";
      const titleSpan = spanOf(input, scenario);
      draft = {
        summary: `[fixture] test_diagnosis: ${classification}`,
        operations: [
          {
            op: "create_task",
            ref: "t1",
            fields: {
              title: `Investigate failing test: ${scenario}`.slice(0, 500),
              description:
                `Classification: ${classification}\n` +
                `Suspected component: (undetermined by offline triage)\n` +
                `Suggested fix outline:\n- Reproduce against the failing scenario\n- Compare the failing run's step timeline with the last passing run\n` +
                `Evidence:\n- ${scenario}`,
            },
            confidence: 0.4,
            citations: [{ span: titleSpan, assumption: titleSpan === null }],
          },
        ],
        openQuestions: ["Offline triage — confirm the classification against the DOM snapshot."],
      };
    } else if (call.kind === "acceptance_criteria") {
      const first = lines[0] ?? null;
      const criteria = "Acceptance criteria:\n- [ ] " + (first ?? "works");
      const firstSpan = first ? spanOf(input, first) : null;
      draft = {
        summary: "[fixture] drafted acceptance criteria",
        operations: [
          call.targetsExistingTask
            ? {
                // The task the user launched this from — a real row, named by
                // the reserved ref the server resolves at apply time. Before
                // PR #377's review fix this was a placeholder id that matched
                // nothing, so applying reported success and changed nothing.
                op: "update_task" as const,
                taskId: TARGET_TASK_REF,
                fields: { description: criteria },
                confidence: 0.5,
                citations: [{ span: null, assumption: true }],
              }
            : {
                // No task was targeted, so there is nothing to update: record
                // the criteria as new work rather than as a silent no-op.
                op: "create_task" as const,
                ref: "t1",
                fields: { title: (first ?? "Acceptance criteria").slice(0, 120), description: criteria },
                confidence: 0.5,
                citations: [{ span: firstSpan, assumption: firstSpan === null }],
              },
        ],
        openQuestions: [],
      };
    } else {
      // A decompose launched from a real task parents its subtasks under that
      // task; without one it falls back to nesting under the first line it
      // pulled out of the source.
      const parentRef = call.targetsExistingTask ? TARGET_TASK_REF : "t1";
      const ops = lines.slice(0, 8).map((line, i) => ({
        op: "create_task" as const,
        ref: `t${i + 1}`,
        fields: {
          title: line.slice(0, 120),
          ...(call.kind === "decompose" && (call.targetsExistingTask || i > 0)
            ? { parentRef }
            : {}),
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

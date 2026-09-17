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
    if (
      call.kind === "summarize" ||
      call.kind === "nl_query" ||
      call.kind === "changed_digest"
    ) {
      draft = {
        summary: `[fixture] ${call.kind}: ${input.slice(0, 160)}`.trim(),
        operations: [],
        openQuestions: [],
      };
    } else if (call.kind === "project_brief") {
      const goal = lines[0] ?? input.slice(0, 160);
      draft = {
        summary: [
          `Goal: ${goal}`,
          `Scope: ${lines.slice(1, 4).join("; ") || "(not specified in the input)"}`,
          `Non-goals: (not specified in the input)`,
          `Milestones: ${lines.slice(0, 5).join(" -> ") || "(none identified)"}`,
          `Risks: (see the risks & open questions pass for a dedicated read)`,
        ].join("\n"),
        operations: [],
        openQuestions: [],
      };
    } else if (call.kind === "risks_open_questions") {
      // Every candidate line is treated as a possible risk/unknown — an
      // offline triage, not a judgement call the fixture is qualified to
      // make. Real providers filter this down to what actually reads as a
      // risk; the fixture's job here is determinism, not quality.
      const risks = lines.slice(0, 5);
      const openQuestions = risks.length
        ? risks.map((l) => `Risk/unknown: ${l}`)
        : ["No explicit risks or unknowns found in the input — review before treating this as complete."];
      const first = risks[0] ?? null;
      const firstSpan = first ? spanOf(input, first) : null;
      draft = {
        summary: `[fixture] risks_open_questions: ${openQuestions.length} item(s) surfaced`,
        operations: call.targetsExistingTask
          ? [
              {
                op: "update_task" as const,
                taskId: TARGET_TASK_REF,
                fields: {
                  description: `Risks / unknowns:\n${openQuestions.map((q) => `- ${q}`).join("\n")}`,
                },
                confidence: 0.5,
                citations: [{ span: firstSpan, assumption: firstSpan === null }],
              },
            ]
          : [],
        openQuestions,
      };
    } else if (call.kind === "dedup") {
      // Compare the target task's own text (everything before the retrieved
      // block) against each [RELATED task:...] candidate retrieval actually
      // found. Only task candidates are linkable — a comment or project
      // brief snippet is grounding context, never a duplicate endpoint.
      const relatedMarker = "[RELATED ";
      const markerIdx = input.indexOf(relatedMarker);
      const taskText = (markerIdx === -1 ? input : input.slice(0, markerIdx)).trim();
      const candidates = parseRelated(input).filter((c) => c.id.startsWith("task:"));
      const matches = candidates
        .map((c) => ({ ...c, score: wordOverlap(taskText, `${c.title} ${c.body}`) }))
        .filter((c) => c.score >= DUPLICATE_THRESHOLD)
        .sort((a, b) => b.score - a.score);
      draft = call.targetsExistingTask
        ? {
            summary: matches.length
              ? `[fixture] dedup: ${matches.length} possible duplicate(s) found`
              : "[fixture] dedup: no likely duplicates found",
            operations: matches.map((m) => ({
              op: "link_tasks" as const,
              fromRef: TARGET_TASK_REF,
              toRef: m.id,
              kind: "duplicates" as const,
              confidence: Math.min(0.95, m.score),
              citations: [
                { span: null, assumption: false, source: m.id, quote: m.title.slice(0, 200) },
              ],
            })),
            openQuestions:
              !matches.length && candidates.length
                ? ["No candidate cleared the duplicate threshold — review the closest matches manually."]
                : [],
          }
        : {
            summary: "[fixture] dedup: no target task to compare against",
            operations: [],
            openQuestions: ["No existing task was given, so nothing could be checked for duplicates."],
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

    // Deterministic chunked streaming (issue #236): CI/evals stream against
    // this provider, so "as each parses" has to mean something reproducible
    // rather than a real model's arbitrary token boundaries. Token deltas
    // chunk the summary; each operation is then emitted once, in order,
    // exactly as it appears in the final array — never a partial op.
    if (call.onDelta) {
      for (const chunk of chunksOf(parsed.summary, TOKEN_CHUNK_SIZE)) {
        call.onDelta({ type: "token", text: chunk });
        await Promise.resolve();
      }
      for (const [index, operation] of parsed.operations.entries()) {
        call.onDelta({ type: "operation", operation, index });
        await Promise.resolve();
      }
    }

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

/** Below this normalized word-overlap score, a candidate is not a duplicate. */
const DUPLICATE_THRESHOLD = 0.5;

/** Parses the `[RELATED <id>] <title>\n<body>` blocks renderRetrievedBlock
 *  (prompts.ts) writes into the fenced input, back into structured entries. */
function parseRelated(input: string): { id: string; title: string; body: string }[] {
  const marker = "[RELATED ";
  if (!input.includes(marker)) return [];
  const block = input.slice(input.indexOf(marker));
  return block
    .split(/\n\n(?=\[RELATED )/)
    .map((entry) => entry.match(/^\[RELATED ([^\]]+)\] ([^\n]*)\n?([\s\S]*)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ id: m[1], title: m[2], body: (m[3] ?? "").trim() }));
}

/** Normalized word-overlap in [0,1] — same shape as diff.ts's intra-proposal
 *  `similar()`, kept separate so the fixture provider stays self-contained. */
function wordOverlap(a: string, b: string): number {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
  const sa = new Set(norm(a).split(" ").filter(Boolean));
  const sb = new Set(norm(b).split(" ").filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  const inter = [...sa].filter((w) => sb.has(w)).length;
  return inter / Math.max(sa.size, sb.size);
}

/** issue #236: chunk size for the fixture's deterministic token stream. */
const TOKEN_CHUNK_SIZE = 24;

function chunksOf(text: string, size: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length; i += size) out.push(text.slice(i, i + size));
  return out;
}

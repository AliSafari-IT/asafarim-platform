import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../../content/tools";
import { actionPlanExampleOutput } from "../../../content/tool-fixtures/notes-to-action-plan";
import { testPlanExampleOutput } from "../../../content/tool-fixtures/requirements-to-test-plan";
import { timelineExampleOutput } from "../../../content/tool-fixtures/text-to-cited-timeline";
import { ActionPlanEditor } from "../action-plan/ActionPlanEditor";
import { toMarkdown as actionPlanMarkdown } from "../action-plan/export";
import { initialReview } from "../action-plan/plan-state";
import { toMarkdown as testPlanMarkdown } from "../test-plan/export";
import { TestPlanEditor } from "../test-plan/TestPlanEditor";
import { initialTimelineReview, toMarkdown as timelineMarkdown } from "../timeline/review";
import { TimelineEditor } from "../timeline/TimelineEditor";
import type { ToolDefinition, ToolSlug } from "../types";
import { toolAdapters } from "./adapters";
import type { ToolRuntimeConfig } from "./config";
import { executeTool, type ExecuteDeps } from "./execute";
import { createMemoryIdempotencyStore, hashInput } from "./idempotency";

/**
 * #680: raw user content must never reach logs, cost events, warnings,
 * idempotency keys, or executable markup — for every real tool, in fixture
 * and live paths.
 */
const CANARY = "CANARY7f3aSECRET";

const inputs: Record<Exclude<ToolSlug, "shell-reference">, unknown> = {
  "requirements-to-test-plan": { requirement: `As a user I can export my data as CSV. ${CANARY} must be kept private.` },
  "notes-to-action-plan": { notes: `Planning\n- Draft the export feature ${CANARY}.\n- Review the copy.` },
  "text-to-cited-timeline": { text: `The archive opened in 1999 with ${CANARY} inside. It closed in 2005.` },
};

/** A canned model answer that echoes the canary, as a real model would. */
const echo: Record<keyof typeof inputs, unknown> = {
  "requirements-to-test-plan": {
    title: `Export ${CANARY}`,
    summary: CANARY,
    actors: [],
    goals: [],
    questions: [],
    scenarios: [
      { title: CANARY, category: "happy_path", priority: "high", basis: "requirement", sourceIds: ["R1"], assumption: "", preconditions: [], steps: [CANARY], expected: CANARY },
      { title: "ghost", category: "happy_path", priority: "high", basis: "requirement", sourceIds: ["R9"], assumption: "", preconditions: [], steps: ["x"], expected: "x" },
    ],
  },
  "notes-to-action-plan": {
    title: CANARY,
    objective: CANARY,
    scope: CANARY,
    tasks: [
      { key: "a", title: `Draft ${CANARY}`, description: CANARY, effort: null, basis: "fact", sourceIds: ["N2"], rationale: "" },
      { key: "b", title: "Sam to review", description: "", effort: null, basis: "fact", sourceIds: ["N3"], rationale: "" },
    ],
    dependencies: [],
    risks: [],
    decisions: [],
    questions: [],
    milestones: [],
  },
  "text-to-cited-timeline": {
    title: CANARY,
    summary: CANARY,
    events: [
      { key: "a", title: CANARY, description: CANARY, dateText: "1999", basis: "cited", sourceIds: ["S1"], confidence: "high", uncertainty: "" },
      { key: "b", title: "Closed", description: "", dateText: `2005-01-01 ${CANARY}`, basis: "cited", sourceIds: ["S2"], confidence: "high", uncertainty: "" },
    ],
    conflicts: [],
  },
};

function harness(slug: ToolSlug, config: ToolRuntimeConfig, response?: unknown) {
  const logs: unknown[] = [];
  const events: unknown[] = [];
  const entry = toolCatalogue.find((t) => t.slug === slug)!;
  const tool: ToolDefinition = { ...entry, lifecycle: "beta", indexable: true, liveGeneration: true };
  const deps: ExecuteDeps = {
    config,
    createProvider: () => ({
      name: "anthropic",
      complete: async () => ({
        text: JSON.stringify(response),
        responseModel: "claude-opus-5",
        providerRequestId: "req_123",
        usage: { inputTokens: 100, outputTokens: 100, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
        stop: "complete",
        fallbackUsed: false,
      }),
    }),
    store: createMemoryIdempotencyStore(),
    sink: { record: async (e) => (events.push(e), "evt") },
    log: (e) => logs.push(e),
    resolveTool: () => tool,
  };
  return { deps, logs, events };
}

const stringify = (x: unknown) => JSON.stringify(x, (_k, v) => (typeof v === "bigint" ? v.toString() : v));

describe.each(Object.keys(inputs) as (keyof typeof inputs)[])("%s never leaks raw content", (slug) => {
  const body = { input: inputs[slug], mode: "live", idempotencyKey: "security-test-0001" };

  it("fixture path: logs hold no content", async () => {
    const h = harness(slug, { mode: "fixture", liveEnabled: false, disabledTools: new Set(), provider: null, notes: [] });
    const { envelope } = await executeTool(slug, body, toolAdapters, h.deps);
    expect(envelope.ok).toBe(true);
    expect(stringify(h.logs)).not.toContain(CANARY);
  });

  it("live path: logs, cost events, and warnings hold no content, even when the model echoes it", async () => {
    const h = harness(slug, { mode: "live", liveEnabled: true, disabledTools: new Set(), provider: { name: "anthropic", model: "claude-opus-5", apiKey: "sk-test-KEY" } , notes: [] }, echo[slug]);
    const { envelope } = await executeTool(slug, body, toolAdapters, h.deps);
    expect(envelope.ok).toBe(true);
    expect(h.events).toHaveLength(1);
    for (const sink of [h.logs, h.events, envelope.ok ? envelope.warnings : []]) {
      const text = stringify(sink);
      expect(text).not.toContain(CANARY);
      expect(text).not.toContain("sk-test-KEY");
    }
  });

  it("the dedup key is a one-way hash", () => {
    const hash = hashInput(slug, inputs[slug]);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain(CANARY);
  });
});

describe("output is rendered as text, never markup", () => {
  const XSS = `<img src=x onerror=alert(1)><script>alert(2)</script>[click](javascript:alert(3))`;
  /** Markup or a link that survived unescaped (a backslash before it means Markdown shows it literally). */
  const UNESCAPED_MARKUP = /(?<!\\)<(?:img|script)|(?<!\\)\]\(javascript:/i;
  const noMarkup = (html: string) => {
    expect(html).not.toMatch(/<img|<script|href="javascript:/i);
    expect(html).toContain("&lt;img");
  };

  it("test plan editor and Markdown export", () => {
    const plan = { ...testPlanExampleOutput, title: XSS, scenarios: testPlanExampleOutput.scenarios.map((s) => ({ ...s, expected: XSS })) };
    noMarkup(renderToStaticMarkup(<TestPlanEditor plan={plan} origin="ai" />));
    const md = testPlanMarkdown(plan, plan.scenarios.map((s) => ({ ...s, origin: "ai" as const })));
    expect(md).not.toMatch(UNESCAPED_MARKUP);
  });

  it("action plan editor and Markdown export", () => {
    const plan = { ...actionPlanExampleOutput, objective: XSS, tasks: actionPlanExampleOutput.tasks.map((t) => ({ ...t, title: XSS })) };
    noMarkup(renderToStaticMarkup(<ActionPlanEditor plan={plan} origin="ai" />));
    expect(actionPlanMarkdown(plan, initialReview(plan, "ai"))).not.toMatch(UNESCAPED_MARKUP);
  });

  it("timeline editor and Markdown export", () => {
    const timeline = { ...timelineExampleOutput, summary: XSS, events: timelineExampleOutput.events.map((e) => ({ ...e, title: XSS })) };
    noMarkup(renderToStaticMarkup(<TimelineEditor timeline={timeline} origin="ai" />));
    const review = initialTimelineReview(timeline, "ai");
    const accepted = { ...review, events: review.events.map((e) => ({ ...e, status: "accepted" as const })) };
    expect(timelineMarkdown(timeline, accepted)).not.toMatch(UNESCAPED_MARKUP);
  });
});

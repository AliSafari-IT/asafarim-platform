import { describe, expect, it } from "vitest";
import { toolCatalogue } from "../../../../content/tools";
import { timelineExampleInput, timelineExampleOutput } from "../../../../content/tool-fixtures/text-to-cited-timeline";
import { findDatePhrase } from "../../timeline/dates";
import { timelineEvalCases, timelineModelResponses } from "../../timeline/eval-cases";
import { citedTimelineSchema, dateIsQuoted, type CitedTimeline } from "../../timeline/schema";
import { splitSentences } from "../../timeline/sources";
import type { ToolDefinition } from "../../types";
import type { ToolRuntimeConfig } from "../config";
import { executeTool, type ExecuteDeps } from "../execute";
import { createMemoryIdempotencyStore } from "../idempotency";
import { toolAdapters } from ".";
import { buildTimelinePrompt, heuristicTimeline, textToCitedTimelineAdapter as adapter, toCitedTimeline } from "./text-to-cited-timeline";

const SLUG = "text-to-cited-timeline";
const catalogueEntry = toolCatalogue.find((t) => t.slug === SLUG)!;
const liveEntry: ToolDefinition = { ...catalogueEntry, lifecycle: "beta", indexable: true, liveGeneration: true };
const partial = adapter.inputSchema.parse(timelineEvalCases.find((c) => c.id === "partial-dates")!.input);
const LIVE: ToolRuntimeConfig = { mode: "live", liveEnabled: true, disabledTools: new Set(), provider: { name: "anthropic", model: "claude-opus-5", apiKey: "k" }, notes: [] };
const FIXTURE: ToolRuntimeConfig = { mode: "fixture", liveEnabled: false, disabledTools: new Set(), provider: null, notes: [] };

function deps(config: ToolRuntimeConfig, tool: ToolDefinition, response?: unknown): ExecuteDeps & { calls: number } {
  const d = {
    calls: 0,
    config,
    createProvider: () => ({
      name: "anthropic" as const,
      complete: async () => {
        if (response === undefined) throw new Error("must not be called");
        d.calls += 1;
        return {
          text: JSON.stringify(response),
          responseModel: "claude-opus-5",
          providerRequestId: null,
          usage: { inputTokens: 2000, outputTokens: 3000, cacheReadInputTokens: 0, cacheWriteInputTokens: 0 },
          stop: "complete" as const,
          fallbackUsed: false,
        };
      },
    }),
    store: createMemoryIdempotencyStore(),
    sink: { record: async () => "evt" },
    log: () => {},
    resolveTool: () => tool,
  };
  return d;
}
const body = (input: unknown, mode: "live" | "example" = "live") => ({ input, mode, idempotencyKey: "test-key-0000000001" });

/** Every dated, cited event quotes its date from the sentences it cites. */
function expectDatesQuoted(t: CitedTimeline) {
  const sources = new Map(t.sources.map((s) => [s.id, s.text]));
  for (const e of t.events) {
    if (e.basis !== "cited" || e.when.precision === "unknown") continue;
    expect(dateIsQuoted(e.when.displayText, e.sourceIds.map((id) => sources.get(id) ?? "")), `${e.id} ${e.when.displayText}`).toBe(true);
  }
}

describe("registration and example", () => {
  it("is registered, examples-only, and unlisted while experimental", () => {
    expect(toolAdapters[SLUG]).toBe(adapter);
    expect(catalogueEntry).toMatchObject({ lifecycle: "experiment", indexable: false, liveGeneration: false, relatedApp: { key: "timelineai" } });
  });

  it("the example is schema-valid and demonstrates every precision case the issue asks for", () => {
    expect(citedTimelineSchema.safeParse(timelineExampleOutput).success).toBe(true);
    expect(adapter.fixture(adapter.inputSchema.parse(adapter.exampleInput(catalogueEntry.example.input)))).toEqual(timelineExampleOutput);
    const precisions = new Set(timelineExampleOutput.events.map((e) => e.when.precision));
    for (const p of ["day", "season", "decade", "year", "month", "range", "unknown"]) expect(precisions).toContain(p);
    expect(timelineExampleOutput.conflicts.map((c) => c.kind).sort()).toEqual(["ambiguous_date", "conflicting_dates", "impossible_range"]);
    expect(timelineExampleOutput.events.some((e) => e.basis === "inferred" && e.sourceIds.length === 0)).toBe(true);
    expectDatesQuoted(timelineExampleOutput);
  });

  it("example mode returns the example with no provider call, even with live off", async () => {
    const d = deps({ ...FIXTURE, mode: "off" }, catalogueEntry);
    const { envelope } = await executeTool(SLUG, body(timelineExampleInput, "example"), toolAdapters, d);
    expect(envelope).toMatchObject({ ok: true, mode: "fixture", output: { title: "The Riverside Library" } });
  });

  it("live mode is provider_disabled while the catalogue says examples only", async () => {
    const d = deps(LIVE, catalogueEntry, timelineModelResponses.good);
    const { envelope } = await executeTool(SLUG, body(partial), toolAdapters, d);
    expect(!envelope.ok && envelope.error.code).toBe("provider_disabled");
    expect(d.calls).toBe(0);
  });
});

describe("eval cases in fixture mode", () => {
  it.each(timelineEvalCases.map((c) => [c.id, c] as const))("%s", async (_, c) => {
    const { envelope } = await executeTool(SLUG, body(c.input), toolAdapters, deps(FIXTURE, liveEntry));
    if (c.expect.fixtureOutcome !== "ok") {
      expect(!envelope.ok && envelope.error.code).toBe(c.expect.fixtureOutcome);
      return;
    }
    expect(envelope.ok).toBe(true);
    const t = (envelope.ok ? envelope.output : null) as CitedTimeline;
    expect(citedTimelineSchema.safeParse(t).success).toBe(true);
    if (c.expect.datesQuoted) expectDatesQuoted(t);
    if (c.expect.precisions) expect(t.events.map((e) => e.when.precision).sort()).toEqual([...c.expect.precisions].sort());
    if (c.kind === "impossible-range") expect(t.conflicts.map((x) => x.kind)).toContain("impossible_range");
  });
});

describe("toCitedTimeline (post-call validation)", () => {
  it("dates each event with TimelineAI's parser and orders them chronologically, undated last", async () => {
    const d = deps(LIVE, liveEntry, timelineModelResponses.good);
    const { envelope } = await executeTool(SLUG, body(partial), toolAdapters, d);
    expect(envelope.ok && envelope.status).toBe("succeeded");
    const t = (envelope.ok ? envelope.output : null) as CitedTimeline;
    expect(t.events.map((e) => [e.id, e.title, e.when.precision])).toEqual([
      ["EV-01", "Company started", "decade"],
      ["EV-02", "First shop", "year"],
      ["EV-03", "Second shop", "season"],
      ["EV-04", "Logo change", "month"],
      ["EV-05", "Growth after the first shop", "unknown"],
    ]);
    expect(t.events[4]).toMatchObject({ basis: "inferred", sourceIds: [] });
  });

  it("removes dates the text doesn't word that way — no false precision", () => {
    const result = toCitedTimeline(partial, timelineModelResponses.falsePrecision)!;
    const byTitle = new Map(result.output.events.map((e) => [e.title, e]));
    expect(byTitle.get("Company started")?.when).toMatchObject({ precision: "unknown", displayText: "Undated" });
    expect(byTitle.get("Second shop")?.when.precision).toBe("unknown");
    expect(byTitle.get("Company started")?.uncertainty).toMatch(/1985-01-01.*removed/);
    expect(byTitle.get("First shop")?.when).toMatchObject({ precision: "year", year: 1994 });
    expect(result.dropped).toEqual(["2 dates were removed because the text doesn't word them that way. Those events are shown as undated."]);
    expect(citedTimelineSchema.safeParse(result.output).success).toBe(true);
  });

  it("drops untraceable and duplicate events and conflicts about missing events", () => {
    const result = toCitedTimeline(partial, timelineModelResponses.untraceable)!;
    expect(result.output.events).toHaveLength(1);
    expect(result.output.conflicts).toEqual([]);
    expect(result.dropped).toEqual([
      "3 events were removed because they didn't cite your text or explain the inference.",
      "1 event was removed because its id was missing or repeated.",
      "1 conflict was removed because it referred to events or text that aren't here.",
    ]);
  });

  it("rejects results with nothing usable and malformed JSON", () => {
    expect(toCitedTimeline(partial, timelineModelResponses.empty)).toBeNull();
    expect(toCitedTimeline(partial, { events: 1 })).toBeNull();
  });

  it("strips injected precision, resolution, and date fields", () => {
    const result = toCitedTimeline(partial, timelineModelResponses.injectedFields)!;
    expect(JSON.stringify(result.output)).not.toMatch(/resolved|startAt|1985-01-01/);
    expect(result.output.events[0].when.precision).toBe("decade");
  });

  it("adds TimelineAI's impossible-range conflict when the model misses it", () => {
    const input = adapter.inputSchema.parse(timelineEvalCases.find((c) => c.kind === "impossible-range")!.input);
    const result = toCitedTimeline(input, {
      title: "Survey",
      summary: "s",
      events: [{ key: "a", title: "Survey", description: "", dateText: "from 2014 to 2011", basis: "cited", sourceIds: ["S1"], confidence: "low", uncertainty: "" }],
      conflicts: [],
    })!;
    expect(result.output.conflicts).toEqual([expect.objectContaining({ kind: "impossible_range", eventIds: ["EV-01"], sourceIds: ["S1"] })]);
  });
});

describe("schema", () => {
  it("rejects a cited event whose date isn't in its source", () => {
    const bad = { ...timelineExampleOutput, events: timelineExampleOutput.events.map((e, i) => (i === 0 ? { ...e, when: { ...e.when, displayText: "1891-03-12" } } : e)) };
    expect(citedTimelineSchema.safeParse(bad).error?.issues[0].message).toBe("the date of EV-01 isn't in its cited text");
  });

  it("rejects conflicts naming unknown events and inferred events without an explanation", () => {
    expect(citedTimelineSchema.safeParse({ ...timelineExampleOutput, conflicts: [{ ...timelineExampleOutput.conflicts[0], eventIds: ["EV-99"] }] }).success).toBe(false);
    const inferred = timelineExampleOutput.events.find((e) => e.basis === "inferred")!;
    const { uncertainty: _u, ...noWhy } = inferred;
    expect(citedTimelineSchema.safeParse({ ...timelineExampleOutput, events: timelineExampleOutput.events.map((e) => (e.id === inferred.id ? noWhy : e)) }).success).toBe(false);
  });
});

describe("text helpers", () => {
  it("splits sentences without breaking on 'c.' or month abbreviations", () => {
    expect(splitSentences("It was built c. 1850 by hand. It burned in Sept. 1901. Rebuilt 1903!").map((s) => s.text)).toEqual([
      "It was built c. 1850 by hand.",
      "It burned in Sept. 1901.",
      "Rebuilt 1903!",
    ]);
  });

  it.each([
    ["It opened on 12 March 1891 by the council.", "12 March 1891"],
    ["Built between 1932 and 1937 by the state.", "between 1932 and 1937"],
    ["Repairs ran from 1998 to 2001.", "from 1998 to 2001"],
    ["It was popular in the 1960s.", "the 1960s"],
    ["Founded circa 1200 BCE near the river.", "circa 1200 BCE"],
    ["It opened in the spring of 1893.", "the spring of 1893"],
    ["No dates here at all.", null],
  ])("findDatePhrase(%j) → %j", (sentence, phrase) => {
    expect(findDatePhrase(sentence)).toBe(phrase);
  });
});

describe("prompt", () => {
  const injection = adapter.inputSchema.parse(timelineEvalCases.find((c) => c.kind === "prompt-injection")!.input);
  const prompt = buildTimelinePrompt(injection);

  it("fences the text as data and tells the model never to normalize dates", () => {
    expect(prompt.system).not.toContain("IGNORE ALL PREVIOUS INSTRUCTIONS");
    expect(prompt.user).toContain("IGNORE ALL PREVIOUS INSTRUCTIONS");
    expect(prompt.system).toMatch(/Never rewrite, normalize, complete, or convert a date/);
    expect(prompt.user.match(/<\/text>/g)).toHaveLength(1);
  });

  it("stays within the byte budget for the largest input", () => {
    const big = adapter.inputSchema.parse({ text: "Word. ".repeat(1_999), title: "t".repeat(120), audience: "a".repeat(120), dateRange: "d".repeat(100) });
    const p = buildTimelinePrompt(big);
    expect(Buffer.byteLength(p.system + p.user)).toBeLessThan(adapter.limits.maxInputBytes);
  });
});

describe("heuristic fixture", () => {
  it("is deterministic and valid, and reports when nothing is dated", () => {
    expect(heuristicTimeline(partial)).toEqual(heuristicTimeline(partial));
    const none = heuristicTimeline(adapter.inputSchema.parse(timelineEvalCases.find((c) => c.kind === "no-dates")!.input));
    expect(none.events).toEqual([expect.objectContaining({ title: "No dated events found", basis: "inferred" })]);
    expect(citedTimelineSchema.safeParse(none).success).toBe(true);
  });
});

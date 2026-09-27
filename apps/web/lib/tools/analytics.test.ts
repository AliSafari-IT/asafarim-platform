import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runOutcomeEvent, sanitizeEvent, trackToolEvent, type ToolEvent } from "./analytics";
import { toolAdapters } from "./server/adapters";
import { TOOL_SLUGS } from "./types";
import { TOOL_VERSIONS } from "./versions";

const base = { tool: "notes-to-action-plan" as const, tool_version: "1.0.0" };

describe("analytics sanitizer", () => {
  it("keeps allowlisted keys and values only", () => {
    expect(sanitizeEvent("ai_tool_exported", { ...base, format: "json" })).toEqual({ name: "ai_tool_exported", props: { ...base, format: "json" } });
  });

  it("drops content, identifiers, and free text even if a caller slips them in", () => {
    const leaky = {
      ...base,
      format: "json",
      input: "Kick-off: moving the help centre",
      output: "{…}",
      excerpt: "N6 Need an inventory",
      prompt: "You turn messy notes…",
      email: "someone@example.com",
      ip: "203.0.113.7",
      handoffId: "0b6f2a4e-5c1d-4e8f-9a7b-3c2d1e0f9a8b",
      error: "Anthropic 529: overloaded",
    };
    const clean = sanitizeEvent("ai_tool_exported", leaky)!;
    expect(clean.props).toEqual({ ...base, format: "json" });
    expect(JSON.stringify(clean)).not.toMatch(/help centre|inventory|example\.com|203\.0|0b6f|overloaded|You turn/);
  });

  it("rejects values outside the dictionary, unknown events, and events without a tool", () => {
    expect(sanitizeEvent("ai_tool_exported", { ...base, format: "pdf" })!.props).toEqual(base);
    expect(sanitizeEvent("ai_tool_run_failed", { ...base, category: "Provider said: timeout for user x" })!.props).toEqual(base);
    expect(sanitizeEvent("ai_tool_view", { tool: "some free text", tool_version: "1.0.0" })).toBeNull();
    expect(sanitizeEvent("ai_tool_view", { tool: "notes-to-action-plan", tool_version: "latest-2026-09-27T12:00" })).toBeNull();
    expect(sanitizeEvent("page_leak", base)).toBeNull();
  });
});

describe("trackToolEvent", () => {
  const event: ToolEvent = { name: "ai_tool_run_succeeded", props: { ...base, mode: "fixture" } };

  it("sends the sanitized event to Umami", () => {
    const track = vi.fn();
    trackToolEvent(event, { umami: { track } });
    expect(track).toHaveBeenCalledWith("ai_tool_run_succeeded", { ...base, mode: "fixture" });
  });

  it("skips automated browsers and missing analytics, and never throws", () => {
    const track = vi.fn();
    trackToolEvent(event, { umami: { track }, webdriver: true });
    trackToolEvent(event, {});
    expect(track).not.toHaveBeenCalled();
    expect(() => trackToolEvent(event, { umami: { track: () => { throw new Error("blocked"); } } })).not.toThrow();
  });
});

describe("run outcomes", () => {
  it.each([
    [{ kind: "success", mode: "live" as const }, "ai_tool_run_succeeded", { mode: "live" }],
    [{ kind: "degraded", mode: "fixture" as const }, "ai_tool_run_degraded", { mode: "fixture" }],
    [{ kind: "invalid" }, "ai_tool_run_failed", { category: "invalid" }],
    [{ kind: "rate-limited", scope: "visitor" }, "ai_tool_run_failed", { category: "rate_limited" }],
    [{ kind: "rate-limited", scope: "daily" }, "ai_tool_run_failed", { category: "quota" }],
    [{ kind: "provider-disabled", reason: "paused" }, "ai_tool_run_failed", { category: "paused" }],
    [{ kind: "provider-disabled", reason: "unavailable" }, "ai_tool_run_failed", { category: "unavailable" }],
    [{ kind: "failed" }, "ai_tool_run_failed", { category: "failed" }],
  ])("%j → %s", (outcome, name, extra) => {
    expect(runOutcomeEvent(base, outcome)).toEqual({ name, props: { ...base, ...extra } });
  });
});

describe("centralized instrumentation", () => {
  const root = path.resolve(__dirname, "../..");
  const files = ["app", "components", "lib"].flatMap((dir) => walk(path.join(root, dir)));

  it("only lib/tools/analytics.ts talks to Umami (the layout only loads its script)", () => {
    const allowed = [path.join("lib", "tools", "analytics.ts"), path.join("app", "layout.tsx")];
    const offenders = files.filter((f) => !allowed.some((a) => f.endsWith(a)) && !/\.test\.tsx?$/.test(f) && /\bumami\b/.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(root, f))).toEqual([]);
  });

  it("client tool versions match what the server adapters report", () => {
    for (const slug of TOOL_SLUGS) expect(TOOL_VERSIONS[slug], slug).toBe(toolAdapters[slug].version);
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { toOutcome } from "../server-runner";
import { resolveRuntimeConfig } from "./config";
import { createMemoryIdempotencyStore, hashInput } from "./idempotency";
import { toolError, TOOL_ENVELOPE_VERSION } from "../envelope";
import { normalizeAnthropicError } from "./providers/anthropic";

describe("resolveRuntimeConfig — fails closed", () => {
  const on = new Map<string, unknown>([["web.aiTools.liveEnabled", true]]);

  it("is off by default", () => {
    const c = resolveRuntimeConfig({}, new Map());
    expect(c).toMatchObject({ mode: "off", liveEnabled: false, provider: null });
  });

  it("goes live only with mode=live, the Admin switch on, and a key", () => {
    const c = resolveRuntimeConfig({ AI_TOOLS_MODE: "live", ANTHROPIC_API_KEY: "sk" }, on);
    expect(c.liveEnabled).toBe(true);
    expect(c.provider).toEqual({ name: "anthropic", model: "claude-opus-5", apiKey: "sk" });
  });

  it.each([
    ["an unrecognized mode", { AI_TOOLS_MODE: "yolo", ANTHROPIC_API_KEY: "sk" }, on],
    ["the env kill switch", { AI_TOOLS_MODE: "live", AI_TOOLS_KILL_SWITCH: "1", ANTHROPIC_API_KEY: "sk" }, on],
    ["the Admin switch off", { AI_TOOLS_MODE: "live", ANTHROPIC_API_KEY: "sk" }, new Map()],
    ["unreadable settings", { AI_TOOLS_MODE: "live", ANTHROPIC_API_KEY: "sk" }, null],
  ] as const)("stays off with %s", (_, env, overrides) => {
    expect(resolveRuntimeConfig(env, overrides as Map<string, unknown> | null).liveEnabled).toBe(false);
  });

  it("rejects an unrecognized provider instead of guessing", () => {
    const c = resolveRuntimeConfig({ AI_TOOLS_MODE: "live", AI_TOOLS_PROVIDER: "other", ANTHROPIC_API_KEY: "sk" }, on);
    expect(c.provider).toBeNull();
    expect(c.notes.join()).toMatch(/unrecognized AI_TOOLS_PROVIDER/);
  });

  it("prefers the Admin key, reads the model from env, and parses disabled tools", () => {
    const c = resolveRuntimeConfig(
      { AI_TOOLS_MODE: "live", ANTHROPIC_API_KEY: "env", AI_TOOLS_ANTHROPIC_MODEL: "claude-haiku-4-5" },
      new Map<string, unknown>([...on, ["ai.anthropic.apiKey", "admin"], ["web.aiTools.disabledTools", ["a", 3, "b"]]]),
    );
    expect(c.provider).toEqual({ name: "anthropic", model: "claude-haiku-4-5", apiKey: "admin" });
    expect([...c.disabledTools]).toEqual(["a", "b"]);
  });

  it("never puts the key in operator notes", () => {
    const c = resolveRuntimeConfig({ AI_TOOLS_MODE: "bogus", ANTHROPIC_API_KEY: "sk-secret" }, null);
    expect(c.notes.join()).not.toContain("sk-secret");
  });
});

describe("idempotency store", () => {
  it("hashes inputs one-way and order-independently", () => {
    const h = hashInput("t", { b: 1, a: "secret text" });
    expect(h).toBe(hashInput("t", { a: "secret text", b: 1 }));
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain("secret");
    expect(hashInput("other", { a: "secret text", b: 1 })).not.toBe(h);
  });

  it("forgets entries after the window", async () => {
    let t = 0;
    const store = createMemoryIdempotencyStore({ windowMs: 1_000, now: () => t });
    let calls = 0;
    const exec = async () => (calls++, { ok: true } as never);
    await store.run("k", "h", exec);
    t = 999;
    expect((await store.run("k", "h", exec)).kind).toBe("replayed");
    t = 1_001;
    expect((await store.run("k", "h", exec)).kind).toBe("fresh");
    expect(calls).toBe(2);
  });

  it("bounds memory under a flood of unique keys", async () => {
    const store = createMemoryIdempotencyStore({ maxEntries: 3 });
    for (let i = 0; i < 10; i++) await store.run(`k${i}`, "h", async () => ({ ok: true }) as never);
    // k0 was evicted, so it runs fresh again.
    let ran = false;
    await store.run("k0", "h", async () => ((ran = true), { ok: true } as never));
    expect(ran).toBe(true);
  });
});

describe("normalizeAnthropicError", () => {
  const headers = new Headers({ "retry-after": "12" });
  it.each([
    [new Anthropic.RateLimitError(429, {}, "x", headers), "rate_limited"],
    [new Anthropic.AuthenticationError(401, {}, "x", new Headers()), "auth"],
    [new Anthropic.BadRequestError(400, {}, "x", new Headers()), "bad_request"],
    [new Anthropic.InternalServerError(500, {}, "x", new Headers()), "unavailable"],
    [new Anthropic.APIConnectionTimeoutError(), "timeout"],
    [new Anthropic.APIConnectionError({ message: "down" }), "unavailable"],
    [new Error("weird"), "unavailable"],
  ])("maps %s → %s", (error, kind) => {
    expect(normalizeAnthropicError(error).kind).toBe(kind);
  });

  it("reads retry-after and keeps provider bodies out of the message", () => {
    const e = normalizeAnthropicError(new Anthropic.RateLimitError(429, { error: "user text echoed" }, "user text echoed", headers));
    expect(e.retryAfterSeconds).toBe(12);
    expect(e.message).not.toContain("user text");
  });

  it("distinguishes our timeout abort from a client abort", () => {
    const timeout = new AbortController();
    timeout.abort("timeout");
    expect(normalizeAnthropicError(new Anthropic.APIUserAbortError(), timeout.signal).kind).toBe("timeout");
    const client = new AbortController();
    client.abort("client");
    expect(normalizeAnthropicError(new Anthropic.APIUserAbortError(), client.signal).kind).toBe("cancelled");
  });
});

describe("toOutcome (client mapping)", () => {
  const ok = (status: "succeeded" | "degraded") => ({
    ok: true as const,
    envelopeVersion: TOOL_ENVELOPE_VERSION,
    status,
    tool: { slug: "t", version: "1", schemaVersion: "1" },
    mode: "live" as const,
    output: { x: 1 },
    warnings: ["risks"],
    model: "m",
    promptVersion: "p",
    timing: { durationMs: 1 },
    costEventRef: null,
  });

  it("maps success and degraded, keeping the mode", () => {
    expect(toOutcome(ok("succeeded"))).toEqual({ kind: "success", mode: "live", result: { x: 1 } });
    expect(toOutcome(ok("degraded"))).toEqual({ kind: "degraded", mode: "live", result: { x: 1 }, missing: ["risks"] });
  });

  it.each([
    ["invalid_input", "invalid"],
    ["input_too_large", "invalid"],
    ["rate_limited", "rate-limited"],
    ["quota_exceeded", "rate-limited"],
    ["provider_disabled", "provider-disabled"],
    ["tool_paused", "provider-disabled"],
    ["timeout", "failed"],
    ["invalid_output", "failed"],
    ["internal", "failed"],
  ] as const)("maps %s → %s", (code, kind) => {
    expect(toOutcome(toolError(code)).kind).toBe(kind);
  });

  it("carries the UI-safe message into failures", () => {
    expect(toOutcome(toolError("timeout"))).toMatchObject({ kind: "failed", message: expect.stringMatching(/too long/) });
  });
});

describe("server-only boundary", () => {
  const root = path.resolve(__dirname, "../../..");
  const walk = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
      if (d.name === "node_modules" || d.name.startsWith(".")) return [];
      const p = path.join(dir, d.name);
      return d.isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(d.name) ? [p] : [];
    });
  const sources = [...walk(path.join(root, "lib")), ...walk(path.join(root, "components")), ...walk(path.join(root, "app"))];

  it("marks every non-test module under lib/tools/server as server-only", () => {
    const serverFiles = sources.filter((f) => f.includes(`${path.sep}lib${path.sep}tools${path.sep}server${path.sep}`) && !f.endsWith(".test.ts"));
    expect(serverFiles.length).toBeGreaterThan(5);
    for (const file of serverFiles) {
      expect(fs.readFileSync(file, "utf8"), file).toMatch(/^import "server-only";/);
    }
  });

  it("no client component imports the server boundary or the provider SDK", () => {
    for (const file of sources.filter((f) => /^["']use client["'];/.test(fs.readFileSync(f, "utf8")))) {
      const text = fs.readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/from ["'][^"']*tools\/server\//);
      expect(text, file).not.toMatch(/@anthropic-ai\/sdk/);
    }
  });
});

import { describe, expect, it } from "vitest";
import { redact } from "./redact";

describe("log redaction", () => {
  it("drops CV and credential fields entirely", () => {
    const result = redact({
      cvText: "Ali Safari, born 1980, Genk",
      extractedText: "…",
      apiKey: "sk-live-123",
      Authorization: "Bearer abc",
      JOBMATCH_DATABASE_URL: "postgresql://jobmatch:pw@host/db",
    });
    expect(result).toEqual({});
  });

  it("keeps allow-listed operational fields verbatim", () => {
    const result = redact({ action: "connector.sync", durationMs: 1200, ok: true });
    expect(result).toEqual({ action: "connector.sync", durationMs: 1200, ok: true });
  });

  it("replaces unknown fields with a type marker rather than their value", () => {
    const result = redact({ candidateNote: "prefers remote in Hasselt", scores: [1, 2, 3] });
    expect(result.candidateNote).toBe("[redacted:string]");
    expect(result.scores).toBe("[redacted:array(3)]");
  });

  it("truncates allow-listed strings so a log line cannot be flooded", () => {
    const result = redact({ path: "/x".repeat(400) });
    expect(String(result.path)).toHaveLength(256);
  });

  it("stops recursing before a hostile payload can exhaust the stack", () => {
    let nested: Record<string, unknown> = { action: "deep" };
    for (let i = 0; i < 50; i += 1) nested = { child: nested };
    expect(() => redact(nested)).not.toThrow();
  });
});

import { describe, it, expect } from "vitest";
import { redactSecrets, redactForLogging } from "./redact";

describe("redactSecrets", () => {
  it("redacts an OpenAI-style API key embedded in a string", () => {
    const input = `Provider call failed for key sk-proj-abcdEFGH12345678ijklmnop`;
    expect(redactSecrets(input)).not.toContain("sk-proj-abcdEFGH12345678ijklmnop");
    expect(redactSecrets(input)).toContain("[REDACTED]");
  });

  it("redacts a Postgres connection string", () => {
    const input = "connecting to postgres://appbuilder:hunter2@appbuilder-postgres:5432/appbuilder";
    const out = redactSecrets(input);
    expect(out).not.toContain("hunter2");
  });

  it("redacts an Authorization header value", () => {
    const input = "Authorization: Bearer sk-live-abcdefghijklmnop1234567890";
    expect(redactSecrets(input)).not.toContain("abcdefghijklmnop1234567890");
  });

  it("leaves ordinary text untouched", () => {
    const input = "Track construction projects and tasks for a crew.";
    expect(redactSecrets(input)).toBe(input);
  });
});

describe("redactForLogging", () => {
  it("drops values for denylisted keys regardless of nesting", () => {
    const out = redactForLogging({
      job: { id: "abc", provider: { apiKey: "sk-verysecretvalue1234567890", model: "gpt-4o-mini" } },
    }) as any;
    expect(out.job.provider.apiKey).toBe("[REDACTED]");
    expect(out.job.provider.model).toBe("gpt-4o-mini");
  });

  it("pattern-redacts string values even under keys that are not denylisted", () => {
    const out = redactForLogging({ note: "connection was postgres://u:p@host:5432/db" }) as any;
    expect(out.note).not.toContain("postgres://u:p@host:5432/db");
  });

  it("handles arrays and does not throw on deep/cyclic-shaped (bounded) input", () => {
    const nested = { a: { b: { c: { d: { e: { f: { g: { h: { i: "deep" } } } } } } } } };
    expect(() => redactForLogging(nested)).not.toThrow();
  });
});

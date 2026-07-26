import { describe, expect, it } from "vitest";
import { redactFailures, redactDiagnostics } from "./redaction";

describe("redactFailures", () => {
  it("bounds the number of persisted failures", () => {
    const failures = Array.from({ length: 30 }, (_, i) => ({ code: `code_${i}`, message: `message ${i}` }));
    expect(redactFailures(failures)).toHaveLength(20);
  });

  it("truncates an overlong message", () => {
    const failures = [{ code: "long", message: "x".repeat(5000) }];
    expect(redactFailures(failures)[0].message.length).toBeLessThanOrEqual(2000);
  });

  it("redacts a secret-shaped string embedded in a message", () => {
    const failures = [{ code: "leak", message: "connection failed: postgres://user:pass@host:5432/db" }];
    expect(redactFailures(failures)[0].message).not.toContain("user:pass");
    expect(redactFailures(failures)[0].message).toContain("[REDACTED]");
  });

  it("preserves the path field untouched", () => {
    const failures = [{ code: "c", message: "m", path: ["entities", 0, "fields", 1] }];
    expect(redactFailures(failures)[0].path).toEqual(["entities", 0, "fields", 1]);
  });
});

describe("redactDiagnostics", () => {
  it("drops values for never-log keys outright", () => {
    const result = redactDiagnostics({ apiKey: "sk-ant-abcdefghijklmnopqrstuvwxyz", note: "hello" });
    expect(result.apiKey).toBe("[REDACTED]");
    expect(result.note).toBe("hello");
  });

  it("truncates an overlong nested string before redaction", () => {
    const result = redactDiagnostics({ log: "y".repeat(10_000) });
    expect((result.log as string).length).toBeLessThanOrEqual(4_000);
  });

  it("handles nested arrays/objects without throwing", () => {
    const result = redactDiagnostics({ gates: [{ gateKey: "a", evidence: { count: 1 } }] });
    expect(result).toBeTruthy();
  });
});

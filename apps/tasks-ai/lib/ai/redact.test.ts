import { describe, expect, it } from "vitest";
import { looksSensitive, redact } from "./redact";

describe("redact", () => {
  it("removes emails, tokens, DSNs, bearer tokens, JWTs", () => {
    const { text, counts } = redact(
      "mail me at ana@corp.com, key sk-live-abc123def456ghi, " +
        "db postgres://u:p@host:5432/db, Authorization: Bearer abcdefghijkl12345, " +
        "token eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4",
    );
    expect(text).not.toContain("ana@corp.com");
    expect(text).toContain("[EMAIL]");
    expect(text).toContain("[SECRET]");
    expect(text).toContain("[DSN]");
    expect(text).toContain("Bearer [SECRET]");
    expect(text).toContain("[JWT]");
    expect(counts["[EMAIL]"]).toBe(1);
  });

  it("redacts long hex blobs and card-like digit runs", () => {
    expect(redact("id 0123456789abcdef0123456789abcdef").text).toContain("[HEX]");
    expect(redact("card 4111 1111 1111 1111").text).toContain("[CARD]");
  });

  it("leaves ordinary task text untouched", () => {
    const input = "Draft the content brief and design the landing hero by Friday";
    expect(redact(input).text).toBe(input);
  });

  it("flags residual key=value secrets", () => {
    expect(looksSensitive("api_key: hunter2")).toBe(true);
    expect(looksSensitive("just some notes")).toBe(false);
  });
});

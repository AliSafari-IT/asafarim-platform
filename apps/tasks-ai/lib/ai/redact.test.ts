import { describe, expect, it } from "vitest";
import { looksSensitive, mapCitationSpans, mapRedactedSpan, redact } from "./redact";

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

/* ── citation offsets across a redaction (PR #377 review) ─────────────── */

describe("mapping provider offsets back to the original text", () => {
  // The provider only ever sees the redacted string, so its citation spans
  // index that. `[EMAIL]` is seven characters and the address it replaced was
  // seventeen, so every later span is shifted — and used to quote the wrong
  // words under a "From your notes" badge.
  const original = "Mail alice@example.com first. Ship the site before the show.";

  it("recovers the exact original words a redacted span points at", () => {
    const { text, edits } = redact(original);
    const start = text.indexOf("Ship the site");
    const span: [number, number] = [start, start + "Ship the site".length];

    expect(text.slice(span[0], span[1])).toBe("Ship the site");
    // The naive read — the bug this replaces.
    expect(original.slice(span[0], span[1])).not.toBe("Ship the site");

    const mapped = mapRedactedSpan(span, edits, original.length)!;
    expect(original.slice(mapped[0], mapped[1])).toBe("Ship the site");
  });

  it("maps a span covering the redaction back onto what was removed", () => {
    const { text, edits } = redact(original);
    const start = text.indexOf("[EMAIL]");
    const mapped = mapRedactedSpan([start, start + "[EMAIL]".length], edits, original.length)!;
    expect(original.slice(mapped[0], mapped[1])).toBe("alice@example.com");
  });

  it("survives several redactions of different lengths in one input", () => {
    const src = "Call +31 6 12345678 or mail bob@corp.com, then finish the migration plan.";
    const { text, edits } = redact(src);
    const start = text.indexOf("finish the migration plan");
    const mapped = mapRedactedSpan(
      [start, start + "finish the migration plan".length],
      edits,
      src.length,
    )!;
    expect(src.slice(mapped[0], mapped[1])).toBe("finish the migration plan");
  });

  it("is the identity when nothing was redacted", () => {
    const plain = "Draft the brief and design the hero";
    const { edits } = redact(plain);
    expect(mapRedactedSpan([6, 15], edits, plain.length)).toEqual([6, 15]);
  });

  it("refuses a span that cannot be a range of the original", () => {
    const { edits } = redact(original);
    expect(mapRedactedSpan([5, 5], edits, original.length)).toBeNull();
    expect(mapRedactedSpan([-1, 4], edits, original.length)).toBeNull();
    expect(mapRedactedSpan([0, 9999], edits, original.length)).toBeNull();
  });

  it("rewrites a draft's citations and drops the ones that no longer resolve", () => {
    const { text, edits } = redact(original);
    const start = text.indexOf("Ship the site");
    const ops = [
      {
        op: "create_task",
        citations: [
          { span: [start, start + 13] as [number, number], assumption: false },
          { span: [0, 9999] as [number, number], assumption: false },
          { span: null, assumption: true },
        ],
      },
    ];
    const [mapped] = mapCitationSpans(ops, edits, original.length);
    expect(original.slice(...(mapped.citations[0].span as [number, number]))).toBe("Ship the site");
    // Unmappable evidence becomes no evidence rather than the wrong quote.
    expect(mapped.citations[1].span).toBeNull();
    expect(mapped.citations[2].span).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { redactForProvider } from "../ai-redact";

const r = (s: string) => redactForProvider(s).text;

describe("redactForProvider: personal data and secrets are removed", () => {
  it.each([
    [
      "my email is lisa.peeters+school@gmail.com, help",
      "my email is [EMAIL], help",
    ],
    ["mail my mum at MUM@Example.BE", "mail my mum at [EMAIL]"],
    ["call me on +32 470 12 34 56 please", "call me on [PHONE] please"],
    ["mijn nummer is 0470/12.34.56", "mijn nummer is [PHONE]"],
    ["bel 0612345678", "bel [PHONE]"],
    ["text +352621123456", "text [PHONE]"],
    ["US number (555) 123-4567 ok", "US number [PHONE] ok"],
    ["06-12-34-56-78", "[PHONE]"],
    ["card 4111 1111 1111 1111 expires", "card [CARD] expires"],
    ["card 5500-0000-0000-0004", "card [CARD]"],
    ["key sk-proj_abcdefghijklmnop123", "key [SECRET]"],
    ["token ghp_ABCDEFGHIJKLMNOPQRSTUV", "token [SECRET]"],
    [
      "Authorization: Bearer abcdefghijklmnop.qrs",
      "Authorization: Bearer [SECRET]",
    ],
    // A fake JWT, joined at runtime so the secret scanner doesn't flag it.
    [
      [
        "eyJhbGciOiJIUzI1NiJ9",
        "eyJzdWIiOiIxMjM0NTY3ODkwIn0",
        "dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      ].join("."),
      "[JWT]",
    ],
    ["db postgres://user:hunter2@db.local:5432/app", "db [DSN]"],
    ["hash 0123456789abcdef0123456789abcdef", "hash [HEX]"],
  ])("%s", (input, expected) => {
    expect(r(input)).toBe(expected);
  });

  it("counts each kind of replacement", () => {
    const { counts } = redactForProvider(
      "a@b.co and c@d.co, call 0470 12 34 56"
    );
    expect(counts).toEqual({ "[EMAIL]": 2, "[PHONE]": 1 });
  });

  it.each([
    ["Tel: 0470 12 34 56 / 02 123 45 67", "Tel: [PHONE] / [PHONE]"],
    ["0470 12 34 56 0470 65 43 21", "[PHONE] [PHONE]"],
    ["mum 0470 12 34 56\n0470 65 43 21 dad", "mum [PHONE]\n[PHONE] dad"],
    ["+32 470 12 34 56  +352 621 123 456", "[PHONE]  [PHONE]"],
  ])("splits two joined phone numbers: %s", (input, expected) => {
    expect(r(input)).toBe(expected);
  });

  it("fails closed on an unsplittable over-long run that starts like a phone", () => {
    expect(r("call 04701234560470654321")).toBe("call [PHONE]");
  });

  it("counts every phone number in a split match", () => {
    const { counts } = redactForProvider("0470 12 34 56 / 02 123 45 67");
    expect(counts).toEqual({ "[PHONE]": 2 });
  });

  it("stays fast on long text with many word boundaries and no @", () => {
    const input = "a.".repeat(32_000);
    const start = performance.now();
    expect(r(input)).toBe(input);
    expect(performance.now() - start).toBeLessThan(500);
  });

  it("leaves no raw value behind when several kinds are mixed", () => {
    const input =
      "Hi, I'm Noor (noor@school.be, 0470 12 34 56). My key is sk-test_1234567890abcdef. Can you explain fractions?";
    const out = r(input);
    expect(out).not.toContain("noor@school.be");
    expect(out).not.toContain("0470 12 34 56");
    expect(out).not.toContain("sk-test_1234567890abcdef");
    expect(out).toContain("Can you explain fractions?");
  });
});

describe("redactForProvider: homework content is not mangled", () => {
  it.each([
    "Solve 3x^2 + 5x - 2 = 0 for x.",
    "What is 2^31? I got 2147483648.",
    "Is pi = 3.14159265358979 exact?",
    "Round 1234.56789 to two decimals.",
    "Compute the determinant of [[1 0 0] [0 1 0] [0 0 1]]: 1 0 0 0 1 0 0 0 1",
    "The sequence 1, 2, 3, 4, 5, 6, 7, 8, 9 — what comes next?",
    "The French Revolution started on 1789-07-14.",
    "My essay is due 2026-10-18 at 23:59.",
    "Prove that 1000000007 is prime.",
    "Multiply 123456789 by 987654321.",
    "for (let i = 0; i < 10; i++) { total += i * 2; }",
    "const area = Math.PI * r ** 2; // r = 12.5",
    "Avogadro's number is 6.02214076e23.",
    "f(x) = (x - 1)(x + 2)(x - 3)",
    "A 16-digit number that is not a card: 1234 5678 9012 3456",
    "Version 1.2.3.4.5.6.7.8.9 of the textbook",
  ])("%s", (input) => {
    expect(r(input)).toBe(input);
  });
});

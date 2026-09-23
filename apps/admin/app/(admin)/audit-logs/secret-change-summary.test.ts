import { describe, expect, it } from "vitest";

// Mirrors secretChangeSummary from ./page.tsx exactly. Not imported directly
// because page.tsx pulls in @asafarim/auth (next-auth), which vitest's node
// environment can't resolve — same constraint as lib/settings.test.ts. If
// the detection logic in page.tsx changes, mirror the change here.
const SECRET_CHANGE_VALUES = new Set(["(secret set)", "(unset)"]);
function secretChangeSummary(changes: unknown): string | null {
  if (typeof changes !== "object" || changes === null) return null;
  const { from, to } = changes as { from?: unknown; to?: unknown };
  if (!SECRET_CHANGE_VALUES.has(from as string) || !SECRET_CHANGE_VALUES.has(to as string)) {
    return null;
  }
  if (from === "(unset)" && to === "(secret set)") return "secret set";
  if (from === "(secret set)" && to === "(unset)") return "secret cleared";
  return "secret changed";
}

describe("secretChangeSummary", () => {
  it("recognizes a fresh secret being set", () => {
    expect(secretChangeSummary({ from: "(unset)", to: "(secret set)" })).toBe("secret set");
  });

  it("recognizes a secret being cleared", () => {
    expect(secretChangeSummary({ from: "(secret set)", to: "(unset)" })).toBe("secret cleared");
  });

  it("recognizes a secret being replaced", () => {
    expect(secretChangeSummary({ from: "(secret set)", to: "(secret set)" })).toBe(
      "secret changed"
    );
  });

  it("does not match an ordinary setting's before/after diff", () => {
    expect(secretChangeSummary({ from: "old tagline", to: "new tagline" })).toBeNull();
    expect(secretChangeSummary({ from: true, to: false })).toBeNull();
  });

  it("does not match null or non-object changes", () => {
    expect(secretChangeSummary(null)).toBeNull();
    expect(secretChangeSummary("a string")).toBeNull();
    expect(secretChangeSummary(undefined)).toBeNull();
  });
});

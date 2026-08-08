import { describe, it, expect, vi, beforeEach } from "vitest";

// Focused on the #87 AC5 fix: acceptQuote/declineQuote must not distinguish
// "quote belongs to someone else" from "quote doesn't exist". Only the
// prisma calls these two functions reach before that guarantee kicks in are
// mocked — the rest of quotes.ts (booking creation, notifications, etc.) is
// exercised by other tests, not this file.
vi.mock("@asafarim/db", () => ({
  prisma: {
    eduQuote: { findFirst: vi.fn(), update: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { acceptQuote, declineQuote, QuoteError } from "../quotes";

beforeEach(() => {
  vi.mocked(prisma.eduQuote.findFirst).mockReset();
  vi.mocked(prisma.eduQuote.update).mockReset();
});

describe("acceptQuote — ownership (#87 AC5)", () => {
  it("scopes the lookup by the acting student, not just the quote id", async () => {
    vi.mocked(prisma.eduQuote.findFirst).mockResolvedValue(null);
    await expect(acceptQuote("q1", "s1")).rejects.toThrow(QuoteError);
    expect(prisma.eduQuote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "q1", quoteRequest: { studentId: "s1" } },
      }),
    );
  });

  it("throws the same message whether the quote is someone else's or doesn't exist", async () => {
    vi.mocked(prisma.eduQuote.findFirst).mockResolvedValue(null);
    let ownerMismatchMessage: string | undefined;
    try {
      await acceptQuote("real-quote-owned-by-another-student", "s1");
    } catch (e) {
      ownerMismatchMessage = (e as Error).message;
    }

    vi.mocked(prisma.eduQuote.findFirst).mockResolvedValue(null);
    let notFoundMessage: string | undefined;
    try {
      await acceptQuote("nonexistent", "s1");
    } catch (e) {
      notFoundMessage = (e as Error).message;
    }

    expect(ownerMismatchMessage).toBe(notFoundMessage);
  });
});

describe("declineQuote — ownership (#87 AC5)", () => {
  it("scopes the lookup by the acting student, not just the quote id", async () => {
    vi.mocked(prisma.eduQuote.findFirst).mockResolvedValue(null);
    await expect(declineQuote("q1", "s1")).rejects.toThrow(QuoteError);
    expect(prisma.eduQuote.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "q1", quoteRequest: { studentId: "s1" } },
      }),
    );
  });
});

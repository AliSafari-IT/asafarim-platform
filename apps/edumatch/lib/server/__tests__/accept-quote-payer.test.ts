import { describe, expect, it, vi, beforeEach } from "vitest";

// Focused on acceptQuote's payer/authorization wiring (#142) — the booking
// creation transaction itself is exercised elsewhere; this only checks that
// authorizeBookingActor is consulted and its payerId lands on the booking.
vi.mock("@asafarim/db", () => ({
  prisma: {
    eduQuote: { findFirst: vi.fn() },
    eduStudentProfile: { findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

import { prisma } from "@asafarim/db";
import { acceptQuote, QuoteError } from "../quotes";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockPrisma = prisma as any;

function agedYears(years: number): Date {
  const d = new Date();
  d.setUTCFullYear(d.getUTCFullYear() - years);
  return d;
}

function stubQuote(studentId: string) {
  return {
    id: "quote-1",
    status: "PENDING",
    quoteRequestId: "qr-1",
    tutorId: "tutor-1",
    estimatedHours: 1,
    quoteRequest: { studentId, inquiryId: "inq-1", status: "OPEN" },
  };
}

// tx mirrors the real prisma client shape used inside acceptQuote's transaction.
function makeTx() {
  return {
    eduQuote: { update: vi.fn(), updateMany: vi.fn() },
    eduQuoteRequest: { update: vi.fn() },
    eduInquiry: { update: vi.fn() },
    eduBooking: { create: vi.fn().mockResolvedValue({ id: "booking-1" }) },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(makeTx()));
});

describe("acceptQuote — payer resolution (#142)", () => {
  it("an independent 16+ student accepting for themselves pays for it themselves", async () => {
    mockPrisma.eduQuote.findFirst.mockResolvedValue(stubQuote("s-16"));
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "s-16",
      dateOfBirth: agedYears(16),
      parentUserId: null,
    });

    const txSpy = makeTx();
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(txSpy));

    await acceptQuote("quote-1", "s-16");

    expect(txSpy.eduBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payerId: "s-16" }) }),
    );
  });

  it("blocks a 15-year-old from accepting a quote for themselves", async () => {
    mockPrisma.eduQuote.findFirst.mockResolvedValue(stubQuote("s-15"));
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "s-15",
      dateOfBirth: agedYears(15),
      parentUserId: null,
    });

    await expect(acceptQuote("quote-1", "s-15")).rejects.toThrow(QuoteError);
    await expect(acceptQuote("quote-1", "s-15")).rejects.toThrow(/parent or guardian/);
  });

  it("lets a parent accept on behalf of their child, with the parent as payer", async () => {
    mockPrisma.eduQuote.findFirst.mockResolvedValue(stubQuote("child-1"));
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "child-1",
      dateOfBirth: agedYears(10),
      parentUserId: "parent-1",
    });

    const txSpy = makeTx();
    mockPrisma.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(txSpy));

    await acceptQuote("quote-1", "parent-1", "child-1");

    expect(txSpy.eduBooking.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ payerId: "parent-1" }) }),
    );
  });

  it("rejects a caller who is neither the student nor their parent", async () => {
    mockPrisma.eduQuote.findFirst.mockResolvedValue(stubQuote("child-1"));
    mockPrisma.eduStudentProfile.findUnique.mockResolvedValue({
      userId: "child-1",
      dateOfBirth: agedYears(10),
      parentUserId: "parent-1",
    });

    await expect(acceptQuote("quote-1", "stranger", "child-1")).rejects.toThrow(QuoteError);
  });
});

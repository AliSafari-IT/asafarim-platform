import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduInquiry: { findMany: vi.fn() },
    eduBooking: { findMany: vi.fn() },
    eduTutorVerification: { findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { edumatchActivityAdapter } from "./edumatch";

const mockPrisma = prisma as unknown as {
  eduInquiry: { findMany: ReturnType<typeof vi.fn> };
  eduBooking: { findMany: ReturnType<typeof vi.fn> };
  eduTutorVerification: { findMany: ReturnType<typeof vi.fn> };
};

const now = new Date("2026-01-01T00:00:00Z");

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.eduInquiry.findMany.mockResolvedValue([]);
  mockPrisma.eduBooking.findMany.mockResolvedValue([]);
  mockPrisma.eduTutorVerification.findMany.mockResolvedValue([]);
});

describe("edumatchActivityAdapter", () => {
  it("returns an empty, available section when the user has no EduMatch activity", async () => {
    const section = await edumatchActivityAdapter.getActivity({ userId: "u1" });
    expect(section).toMatchObject({ app: "edumatch", supported: true, available: true, entries: [] });
  });

  it("queries bookings by either the student or tutor side", async () => {
    await edumatchActivityAdapter.getActivity({ userId: "u1" });

    expect(mockPrisma.eduBooking.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { OR: [{ studentId: "u1" }, { tutorId: "u1" }] } })
    );
  });

  it("maps a DISPUTED booking to a dispute entry, not a booking entry", async () => {
    mockPrisma.eduBooking.findMany.mockResolvedValue([
      {
        id: "b1",
        studentId: "u1",
        tutorId: "tutor-1",
        scheduledAt: now,
        status: "DISPUTED",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const section = await edumatchActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries).toHaveLength(1);
    expect(section.entries[0]).toMatchObject({ type: "dispute", status: "DISPUTED" });
  });

  it("maps a non-disputed booking to a booking entry", async () => {
    mockPrisma.eduBooking.findMany.mockResolvedValue([
      {
        id: "b2",
        studentId: "u1",
        tutorId: "tutor-1",
        scheduledAt: now,
        status: "SCHEDULED",
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const section = await edumatchActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries[0]).toMatchObject({ type: "booking", status: "SCHEDULED" });
  });

  it("maps tutor verification reviews", async () => {
    mockPrisma.eduTutorVerification.findMany.mockResolvedValue([
      { id: "v1", status: "VERIFIED", resolvedAt: now, createdAt: now, updatedAt: now },
    ]);

    const section = await edumatchActivityAdapter.getActivity({ userId: "u1" });

    expect(section.entries[0]).toMatchObject({ type: "tutor_verification", status: "VERIFIED" });
  });

  describe("listAll", () => {
    function booking(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: "b1",
        status: "SCHEDULED",
        scheduledAt: now,
        createdAt: now,
        updatedAt: now,
        studentId: "student-1",
        student: { email: "student@example.com", name: "Stu Dent" },
        tutor: { email: "tutor@example.com", name: "Tu Tor" },
        quote: { quoteRequest: { inquiry: { subject: "Algebra help" } } },
        ...overrides,
      };
    }

    it("attributes the booking to the student as owner, keeping the tutor in metadata", async () => {
      mockPrisma.eduBooking.findMany.mockResolvedValue([booking()]);

      const result = await edumatchActivityAdapter.listAll!({ limit: 10 });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        id: "b1",
        app: "edumatch",
        type: "booking",
        title: "Algebra help",
        owner: { userId: "student-1", email: "student@example.com", name: "Stu Dent" },
        metadata: { tutorEmail: "tutor@example.com", tutorName: "Tu Tor" },
      });
    });

    it("maps a DISPUTED booking to a dispute entry, same as getActivity", async () => {
      mockPrisma.eduBooking.findMany.mockResolvedValue([booking({ status: "DISPUTED" })]);

      const result = await edumatchActivityAdapter.listAll!({ limit: 10 });

      expect(result.entries[0]).toMatchObject({ type: "dispute", status: "DISPUTED" });
    });

    it("paginates with a createdAt cursor when more rows exist than the limit", async () => {
      mockPrisma.eduBooking.findMany.mockResolvedValue([
        booking({ id: "b1", createdAt: new Date("2026-01-03") }),
        booking({ id: "b2", createdAt: new Date("2026-01-02") }),
      ]);

      const result = await edumatchActivityAdapter.listAll!({ limit: 1 });

      expect(result.entries).toHaveLength(1);
      expect(result.nextCursor).toBe(new Date("2026-01-03").toISOString());
    });

    it("returns a null cursor when every row fit within the limit", async () => {
      mockPrisma.eduBooking.findMany.mockResolvedValue([booking()]);

      const result = await edumatchActivityAdapter.listAll!({ limit: 10 });

      expect(result.nextCursor).toBeNull();
    });
  });
});

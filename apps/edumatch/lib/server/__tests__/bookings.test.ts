import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduBooking: { findUnique: vi.fn(), update: vi.fn() },
    eduTransaction: { create: vi.fn(), findFirst: vi.fn() },
    eduAuditEvent: { create: vi.fn() },
    eduNotificationPreference: { findMany: vi.fn() },
    eduNotification: { createMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import {
  cancelBooking,
  disputeBooking,
  respondToDispute,
  resolveDispute,
  recordRefundTransaction,
  getRefundDisplayState,
  REFUND_COPY,
  BookingTransitionError,
} from "../bookings";

const baseBooking = {
  id: "b1",
  studentId: "s1",
  tutorId: "t1",
  status: "SCHEDULED",
  cancelledAt: null,
  cancellationReason: null,
  completedAt: null,
};

beforeEach(() => {
  vi.mocked(prisma.eduBooking.findUnique).mockReset();
  vi.mocked(prisma.eduBooking.update).mockReset();
  vi.mocked(prisma.eduTransaction.create).mockReset();
  vi.mocked(prisma.eduTransaction.findFirst).mockReset();
  vi.mocked(prisma.eduAuditEvent.create).mockReset();
  vi.mocked(prisma.eduAuditEvent.create).mockResolvedValue({} as never);
  vi.mocked(prisma.eduNotificationPreference.findMany).mockReset();
  vi.mocked(prisma.eduNotificationPreference.findMany).mockResolvedValue([]);
  vi.mocked(prisma.eduNotification.createMany).mockReset();
  vi.mocked(prisma.eduNotification.createMany).mockResolvedValue({ count: 1 } as never);
});

describe("cancelBooking", () => {
  it("rejects when actor is not the student or tutor", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue(baseBooking as never);
    await expect(
      cancelBooking({
        bookingId: "b1",
        actorId: "stranger",
        actorRole: "STUDENT",
        reason: "x",
      }),
    ).rejects.toBeInstanceOf(BookingTransitionError);
  });

  it("rejects when no reason is provided", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue(baseBooking as never);
    await expect(
      cancelBooking({
        bookingId: "b1",
        actorId: "s1",
        actorRole: "STUDENT",
        reason: "  ",
      }),
    ).rejects.toBeInstanceOf(BookingTransitionError);
  });

  it("rejects cancelling an already-cancelled booking", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "CANCELLED",
    } as never);
    await expect(
      cancelBooking({
        bookingId: "b1",
        actorId: "s1",
        actorRole: "STUDENT",
        reason: "changed my mind",
      }),
    ).rejects.toBeInstanceOf(BookingTransitionError);
  });

  it("cancels when student is the booking owner", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue(baseBooking as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancellationReason: "[STUDENT] changed my mind",
    } as never);
    const out = await cancelBooking({
      bookingId: "b1",
      actorId: "s1",
      actorRole: "STUDENT",
      reason: "changed my mind",
    });
    expect(out.status).toBe("CANCELLED");
    expect(prisma.eduAuditEvent.create).toHaveBeenCalled();
  });
});

describe("disputeBooking", () => {
  it("allows tutor to dispute a SCHEDULED booking", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue(baseBooking as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
    } as never);
    const out = await disputeBooking({
      bookingId: "b1",
      actorId: "t1",
      actorRole: "TUTOR",
      reason: "Student no-show.",
    });
    expect(out.status).toBe("DISPUTED");
  });

  it("allows post-completion disputes", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "COMPLETED",
    } as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
    } as never);
    const out = await disputeBooking({
      bookingId: "b1",
      actorId: "s1",
      actorRole: "STUDENT",
      reason: "Session never happened",
    });
    expect(out.status).toBe("DISPUTED");
  });

  it("rejects duplicate open disputes", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
      scheduledAt: new Date(),
    } as never);
    await expect(
      disputeBooking({
        bookingId: "b1",
        actorId: "s1",
        actorRole: "STUDENT",
        reason: "Still unresolved",
      }),
    ).rejects.toBeInstanceOf(BookingTransitionError);
  });
});

describe("respondToDispute", () => {
  it("allows the tutor to respond to an open dispute", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
      cancellationReason: "[DISPUTE:STUDENT] Tutor did not arrive",
    } as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
      cancellationReason:
        "[DISPUTE:STUDENT] Tutor did not arrive\n[RESPONSE:TUTOR] I was online",
    } as never);

    const out = await respondToDispute({
      bookingId: "b1",
      actorId: "t1",
      actorRole: "TUTOR",
      message: "I was online",
    });

    expect(out.status).toBe("DISPUTED");
    expect(prisma.eduBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancellationReason: expect.stringContaining("[RESPONSE:TUTOR] I was online"),
        }),
      }),
    );
  });
});

describe("resolveDispute", () => {
  it("requires a DISPUTED booking", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue(baseBooking as never);
    await expect(
      resolveDispute({
        bookingId: "b1",
        adminId: "a1",
        resolution: "REFUND",
        reason: "x",
      }),
    ).rejects.toBeInstanceOf(BookingTransitionError);
  });

  it("REFUND resolution cancels and records a refund transaction", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
    } as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "CANCELLED",
    } as never);
    vi.mocked(prisma.eduTransaction.create).mockResolvedValue({
      id: "tx1",
      type: "REFUND",
    } as never);

    const out = await resolveDispute({
      bookingId: "b1",
      adminId: "a1",
      resolution: "REFUND",
      reason: "Tutor missed session",
      refundCents: 5000,
    });

    expect(out.status).toBe("CANCELLED");
    expect(prisma.eduTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "REFUND",
          grossCents: 5000,
        }),
      }),
    );
  });

  it("NO_REFUND resolution marks COMPLETED without a refund tx", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
    } as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "COMPLETED",
    } as never);
    const out = await resolveDispute({
      bookingId: "b1",
      adminId: "a1",
      resolution: "NO_REFUND",
      reason: "Session was actually held",
    });
    expect(out.status).toBe("COMPLETED");
    expect(prisma.eduTransaction.create).not.toHaveBeenCalled();
  });

  it("REQUEST_INFO keeps dispute open and records admin request", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
      cancellationReason: "[DISPUTE:STUDENT] Need review",
    } as never);
    vi.mocked(prisma.eduBooking.update).mockResolvedValue({
      ...baseBooking,
      status: "DISPUTED",
    } as never);

    const out = await resolveDispute({
      bookingId: "b1",
      adminId: "a1",
      resolution: "REQUEST_INFO",
      reason: "Please upload session notes",
    });

    expect(out.status).toBe("DISPUTED");
    expect(prisma.eduTransaction.create).not.toHaveBeenCalled();
    expect(prisma.eduBooking.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cancellationReason: expect.stringContaining("[ADMIN_REQUEST_INFO:ADMIN] Please upload session notes"),
        }),
      }),
    );
  });
});

describe("recordRefundTransaction", () => {
  it("records a REFUND row with negative netCents", async () => {
    vi.mocked(prisma.eduTransaction.create).mockResolvedValue({
      id: "tx1",
      type: "REFUND",
    } as never);
    await recordRefundTransaction({
      bookingId: "b1",
      tutorId: "t1",
      amountCents: 4000,
    });
    expect(prisma.eduTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "REFUND",
          grossCents: 4000,
          netCents: -4000,
        }),
      }),
    );
  });
});

describe("getRefundDisplayState", () => {
  it("returns NONE for fresh bookings", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      status: "SCHEDULED",
    } as never);
    vi.mocked(prisma.eduTransaction.findFirst).mockResolvedValue(null);
    expect(await getRefundDisplayState("b1")).toBe("NONE");
  });

  it("returns REQUESTED while disputed", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      status: "DISPUTED",
    } as never);
    vi.mocked(prisma.eduTransaction.findFirst).mockResolvedValue(null);
    expect(await getRefundDisplayState("b1")).toBe("REQUESTED");
  });

  it("returns RECORDED once a REFUND tx exists", async () => {
    vi.mocked(prisma.eduBooking.findUnique).mockResolvedValue({
      status: "CANCELLED",
    } as never);
    vi.mocked(prisma.eduTransaction.findFirst).mockResolvedValue({
      id: "tx1",
    } as never);
    expect(await getRefundDisplayState("b1")).toBe("RECORDED");
  });

  it("display copy avoids 'processed' wording for RECORDED", () => {
    expect(REFUND_COPY.RECORDED).not.toMatch(/processed (?!in the next reconciliation cycle)/i);
    expect(REFUND_COPY.APPROVED).toMatch(/has not yet/i);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  prisma: {
    eduAuditEvent: { create: vi.fn(), findMany: vi.fn() },
  },
}));

import { prisma } from "@asafarim/db";
import { recordEduAuditEvent, listEduAuditEvents } from "../audit";

beforeEach(() => {
  vi.mocked(prisma.eduAuditEvent.create).mockReset();
  vi.mocked(prisma.eduAuditEvent.findMany).mockReset();
});

describe("recordEduAuditEvent", () => {
  it("writes a row with all provided fields", async () => {
    vi.mocked(prisma.eduAuditEvent.create).mockResolvedValue({} as never);
    await recordEduAuditEvent({
      actorId: "u1",
      actorRole: "ADMIN",
      action: "TUTOR_VERIFICATION_VERIFIED",
      entity: "EduTutorVerification",
      entityId: "v1",
      prevState: "PENDING",
      nextState: "VERIFIED",
      reason: "All checks passed",
      metadata: { tutorId: "t1" },
    });
    const call = vi.mocked(prisma.eduAuditEvent.create).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.action).toBe("TUTOR_VERIFICATION_VERIFIED");
    expect(call.data.actorRole).toBe("ADMIN");
    expect(call.data.prevState).toBe("PENDING");
    expect(call.data.nextState).toBe("VERIFIED");
  });

  it("swallows DB errors and never throws", async () => {
    vi.mocked(prisma.eduAuditEvent.create).mockRejectedValue(new Error("db down"));
    await expect(
      recordEduAuditEvent({
        action: "INQUIRY_CREATED",
        entity: "EduInquiry",
      }),
    ).resolves.toBeUndefined();
  });

  it("handles missing optional fields", async () => {
    vi.mocked(prisma.eduAuditEvent.create).mockResolvedValue({} as never);
    await recordEduAuditEvent({
      action: "AI_RESPONSE_GENERATED",
      entity: "EduAiResponse",
    });
    const call = vi.mocked(prisma.eduAuditEvent.create).mock.calls[0]?.[0] as {
      data: Record<string, unknown>;
    };
    expect(call.data.actorId).toBeNull();
    expect(call.data.metadata).toBeNull();
  });
});

describe("listEduAuditEvents", () => {
  it("filters by entity / entityId", async () => {
    vi.mocked(prisma.eduAuditEvent.findMany).mockResolvedValue([] as never);
    await listEduAuditEvents({ entity: "EduBooking", entityId: "b1" });
    const call = vi.mocked(prisma.eduAuditEvent.findMany).mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(call.where).toEqual({ entity: "EduBooking", entityId: "b1" });
    expect(call.take).toBe(50);
  });
});

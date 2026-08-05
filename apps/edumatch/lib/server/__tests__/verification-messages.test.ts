import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@asafarim/db", () => ({
  Prisma: {
    JsonNull: null,
  },
  prisma: {
    eduVerificationMessage: {
      create: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
      count: vi.fn(),
    },
    eduTutorVerification: { findFirst: vi.fn() },
  },
}));

vi.mock("../notifications", () => ({
  notifyVerificationMessage: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../audit", () => ({
  recordEduAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../storage", () => ({
  isKeyOwnedBy: vi.fn((key: string, userId: string) =>
    key.startsWith(`inquiries/${userId}/`),
  ),
  signAttachments: vi.fn().mockResolvedValue([]),
}));

import { prisma } from "@asafarim/db";
import { notifyVerificationMessage } from "../notifications";
import { recordEduAuditEvent } from "../audit";
import { signAttachments } from "../storage";
import {
  postVerificationMessage,
  listVerificationThread,
  markThreadRead,
  countUnreadForTutor,
} from "../verification-messages";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(prisma.eduVerificationMessage.create).mockResolvedValue({
    id: "m1",
  } as never);
});

describe("postVerificationMessage", () => {
  it("ADMIN message notifies the tutor and audits", async () => {
    await postVerificationMessage({
      tutorId: "t1",
      senderId: "a1",
      senderRole: "ADMIN",
      body: "Please upload your certificate.",
    });

    expect(prisma.eduVerificationMessage.create).toHaveBeenCalledWith({
      data: {
        tutorId: "t1",
        senderId: "a1",
        senderRole: "ADMIN",
        body: "Please upload your certificate.",
        attachments: null,
      },
      select: { id: true },
    });
    expect(notifyVerificationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ recipientId: "t1" }),
    );
    expect(recordEduAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "TUTOR_VERIFICATION_MESSAGE_SENT" }),
    );
  });

  it("TUTOR message notifies the last reviewer when known", async () => {
    vi.mocked(prisma.eduTutorVerification.findFirst).mockResolvedValue({
      reviewerId: "admin-9",
    } as never);

    await postVerificationMessage({
      tutorId: "t1",
      senderId: "t1",
      senderRole: "TUTOR",
      body: "Done — uploaded it.",
    });

    expect(notifyVerificationMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        recipientId: "admin-9",
        forAdmin: true,
        tutorId: "t1",
      }),
    );
  });

  it("TUTOR message skips notification when no reviewer is known", async () => {
    vi.mocked(prisma.eduTutorVerification.findFirst).mockResolvedValue(
      null as never,
    );
    await postVerificationMessage({
      tutorId: "t1",
      senderId: "t1",
      senderRole: "TUTOR",
      body: "Hello?",
    });
    expect(notifyVerificationMessage).not.toHaveBeenCalled();
  });

  it("rejects an empty body", async () => {
    await expect(
      postVerificationMessage({
        tutorId: "t1",
        senderId: "a1",
        senderRole: "ADMIN",
        body: "   ",
      }),
    ).rejects.toThrow(/required/i);
    expect(prisma.eduVerificationMessage.create).not.toHaveBeenCalled();
  });

  it("trims the body before storing", async () => {
    await postVerificationMessage({
      tutorId: "t1",
      senderId: "a1",
      senderRole: "ADMIN",
      body: "  hi  ",
    });
    const arg = vi.mocked(prisma.eduVerificationMessage.create).mock
      .calls[0]?.[0] as { data: { body: string } };
    expect(arg.data.body).toBe("hi");
  });

  it("stores owned attachments and allows attachment-only messages", async () => {
    await postVerificationMessage({
      tutorId: "t1",
      senderId: "a1",
      senderRole: "ADMIN",
      body: "   ",
      attachments: [
        {
          key: "inquiries/a1/file-1/certificate.pdf",
          mime: "application/pdf",
          filename: "certificate.pdf",
          sizeBytes: 1200,
        },
        {
          key: "inquiries/other/file-2/private.pdf",
          mime: "application/pdf",
          filename: "private.pdf",
          sizeBytes: 1200,
        },
      ],
    });

    const arg = vi.mocked(prisma.eduVerificationMessage.create).mock
      .calls[0]?.[0] as unknown as {
      data: { body: string; attachments: unknown[] };
    };
    expect(arg.data.body).toBe("");
    expect(arg.data.attachments).toEqual([
      {
        key: "inquiries/a1/file-1/certificate.pdf",
        mime: "application/pdf",
        filename: "certificate.pdf",
        sizeBytes: 1200,
      },
    ]);
    expect(notifyVerificationMessage).toHaveBeenCalledWith(
      expect.objectContaining({ preview: "Attachment: certificate.pdf" }),
    );
  });
});

describe("listVerificationThread", () => {
  it("maps rows to views (oldest first, sender name, ISO dates)", async () => {
    const now = new Date("2026-05-29T10:00:00Z");
    vi.mocked(prisma.eduVerificationMessage.findMany).mockResolvedValue([
      {
        id: "m1",
        senderRole: "ADMIN",
        senderId: "a1",
        sender: { name: "Reviewer" },
        body: "hi",
        attachments: [{ key: "inquiries/a1/file/cert.pdf" }],
        readAt: null,
        createdAt: now,
      },
    ] as never);
    vi.mocked(signAttachments).mockResolvedValue([
      {
        url: "https://signed.example/cert.pdf",
        mime: "application/pdf",
        filename: "cert.pdf",
        sizeBytes: 123,
      },
    ]);

    const out = await listVerificationThread("t1");
    expect(out).toEqual([
      {
        id: "m1",
        senderRole: "ADMIN",
        senderId: "a1",
        senderName: "Reviewer",
        body: "hi",
        attachments: [
          {
            url: "https://signed.example/cert.pdf",
            mime: "application/pdf",
            filename: "cert.pdf",
            sizeBytes: 123,
          },
        ],
        reactions: {},
        readAt: null,
        createdAt: now.toISOString(),
      },
    ]);
    expect(prisma.eduVerificationMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { createdAt: "asc" } }),
    );
  });
});

describe("markThreadRead", () => {
  it("tutor reading marks ADMIN messages read", async () => {
    vi.mocked(prisma.eduVerificationMessage.updateMany).mockResolvedValue({
      count: 2,
    } as never);
    const n = await markThreadRead("t1", "TUTOR");
    expect(n).toBe(2);
    expect(prisma.eduVerificationMessage.updateMany).toHaveBeenCalledWith({
      where: { tutorId: "t1", senderRole: "ADMIN", readAt: null },
      data: { readAt: expect.any(Date) },
    });
  });

  it("admin reading marks TUTOR messages read", async () => {
    vi.mocked(prisma.eduVerificationMessage.updateMany).mockResolvedValue({
      count: 0,
    } as never);
    await markThreadRead("t1", "ADMIN");
    expect(prisma.eduVerificationMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tutorId: "t1", senderRole: "TUTOR", readAt: null },
      }),
    );
  });
});

describe("countUnreadForTutor", () => {
  it("counts unread ADMIN messages", async () => {
    vi.mocked(prisma.eduVerificationMessage.count).mockResolvedValue(3 as never);
    const n = await countUnreadForTutor("t1");
    expect(n).toBe(3);
    expect(prisma.eduVerificationMessage.count).toHaveBeenCalledWith({
      where: { tutorId: "t1", senderRole: "ADMIN", readAt: null },
    });
  });
});

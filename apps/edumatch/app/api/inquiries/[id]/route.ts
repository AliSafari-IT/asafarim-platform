import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { signAttachments } from "@/lib/server/storage";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * GET /api/inquiries/[id]
 *
 * Returns a single inquiry with its AI responses.
 * Only the owning student can access it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id } = await params;

    const inquiry = await prisma.eduInquiry.findFirst({
      where: { id, studentId: user.id },
      select: {
        id: true,
        subject: true,
        gradeLevel: true,
        description: true,
        attachments: true,
        aiSummary: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        aiResponses: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            explanation: true,
            modelUsed: true,
            createdAt: true,
          },
        },
      },
    });

    if (!inquiry) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      ...inquiry,
      attachments: await signAttachments(inquiry.attachments),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries/[id]", error);
    }
    return serverError("inquiries/[id]", error);
  }
}

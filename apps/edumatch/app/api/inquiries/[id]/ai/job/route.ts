import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError, badRequest, serverError } from "@/lib/server";
import { enqueueAiJob, isQueueAvailable, AiQueueError } from "@/lib/server/queue";
import { prisma } from "@asafarim/db";

export const runtime = "nodejs";

/**
 * POST /api/inquiries/[id]/ai/job
 *
 * Enqueue an asynchronous AI processing job for the inquiry.
 * STUDENT-only; only the inquiry owner can enqueue.
 *
 * Returns immediately with job metadata; the actual AI call happens in a
 * background worker (or Next.js API route if running the lightweight in-band
 * processor). Suitable for long-running vision/audio inference that may exceed
 * Vercel/Next.js function timeout (e.g., 60s hobby, 300s pro).
 *
 * When Redis is not configured, returns 503 with instructions.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: inquiryId } = await params;

    if (!isQueueAvailable()) {
      return NextResponse.json(
        {
          error:
            "AI job queue is not configured. Set REDIS_URL (or UPSTASH_REDIS_REST_URL) to enable async processing.",
        },
        { status: 503 },
      );
    }

    const inquiry = await prisma.eduInquiry.findUnique({
      where: { id: inquiryId },
      select: { studentId: true, status: true },
    });
    if (!inquiry) {
      return badRequest("Inquiry not found.");
    }
    if (inquiry.studentId !== user.id) {
      return handleEduError("inquiries/ai/job", new Error("Forbidden"));
    }

    // Idempotent: if already processing or AI responded, reject to avoid duplicate billing.
    if (inquiry.status === "AI_RESPONDED") {
      return badRequest("AI already responded to this inquiry.");
    }
    if (inquiry.status === "TUTOR_REQUESTED" || inquiry.status === "BOOKED") {
      return badRequest("Inquiry is already escalated to a tutor.");
    }

    const job = await enqueueAiJob({ inquiryId, studentId: user.id });

    return NextResponse.json({
      jobId: job.id,
      inquiryId,
      status: job.id ? "queued" : "unknown",
    });
  } catch (error) {
    if (error instanceof AiQueueError) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries/ai/job", error);
    }
    return serverError("inquiries/ai/job", error);
  }
}

/**
 * GET /api/inquiries/[id]/ai/job
 *
 * Poll for job status. Returns the latest AI response if the job completed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user } = await requireStudent();
    const { id: inquiryId } = await params;

    const inquiry = await prisma.eduInquiry.findUnique({
      where: { id: inquiryId },
      select: { studentId: true, status: true, aiSummary: true },
    });
    if (!inquiry) {
      return badRequest("Inquiry not found.");
    }
    if (inquiry.studentId !== user.id) {
      return handleEduError("inquiries/ai/job", new Error("Forbidden"));
    }

    // Return latest AI response if present
    const latest = await prisma.eduAiResponse.findFirst({
      where: { inquiryId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        explanation: true,
        modelUsed: true,
        latencyMs: true,
        createdAt: true,
      },
    });

    return NextResponse.json({
      inquiryId,
      status: inquiry.status,
      aiSummary: inquiry.aiSummary,
      latestResponse: latest ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries/ai/job", error);
    }
    return serverError("inquiries/ai/job", error);
  }
}

import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/server/profiles";
import { handleEduError } from "@/lib/server";
import { badRequest, serverError } from "@/lib/server/auth";
import { formatZodError, inquiryIntakeSchema } from "@/lib/server/validation";
import { createInquiry, listInquiriesForStudent, InquiryValidationError } from "@/lib/server/inquiries";
import { orchestrateResponse } from "@/lib/server/ai-orchestrator";

export const runtime = "nodejs";

/**
 * POST /api/inquiries
 *
 * Create a new inquiry from validated intake JSON. Attachments must already
 * have been uploaded via the presign endpoint; this route persists the
 * inquiry row and (in a later phase) enqueues the AI worker.
 */
export async function POST(req: Request) {
  try {
    const { user } = await requireStudent();

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = inquiryIntakeSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const created = await createInquiry(user.id, parsed.data);

    // Phase 2.2: fire-and-forget in-process AI orchestration (non-blocking).
    orchestrateResponse(created.id).catch((e) =>
      console.warn("[inquiries] AI auto-orchestration failed (non-blocking):", e),
    );

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (error instanceof InquiryValidationError) {
      return badRequest(error.message);
    }
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries", error);
    }
    return serverError("inquiries", error);
  }
}

/**
 * GET /api/inquiries
 *
 * List the caller's own inquiries. Tutors / admins use a different surface.
 */
export async function GET() {
  try {
    const { user } = await requireStudent();
    const rows = await listInquiriesForStudent(user.id);
    return NextResponse.json({ items: rows });
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("inquiries", error);
    }
    return serverError("inquiries", error);
  }
}

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { listAdminBookings } from "@/lib/server/admin-queries";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireRole("ADMIN");
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
    const offset = parseInt(searchParams.get("offset") ?? "0");
    const status = searchParams.get("status") || undefined;
    const studentId = searchParams.get("studentId") || undefined;
    const tutorId = searchParams.get("tutorId") || undefined;
    const data = await listAdminBookings({ limit, offset, status, studentId, tutorId });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/bookings", error);
    }
    return serverError("admin/bookings", error);
  }
}

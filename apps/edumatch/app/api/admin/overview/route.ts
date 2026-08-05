import { NextResponse } from "next/server";
import { requireRole } from "@/lib/server/profiles";
import { handleEduError, serverError } from "@/lib/server";
import { getAdminOverviewStats } from "@/lib/server/admin-queries";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireRole("ADMIN");
    const stats = await getAdminOverviewStats();
    return NextResponse.json(stats);
  } catch (error) {
    if (error instanceof Error && error.name === "EduAuthError") {
      return handleEduError("admin/overview", error);
    }
    return serverError("admin/overview", error);
  }
}

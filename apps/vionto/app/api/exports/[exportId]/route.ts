import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";

export const runtime = "nodejs";

/**
 * DELETE /api/exports/[exportId]
 *
 * Soft-deletes (removes) an export record owned by the authenticated user.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ exportId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { exportId } = await params;
    if (!exportId) return badRequest("exportId is required");

    const existing = await prisma.viontoExport.findFirst({
      where: { id: exportId, userId: user.id },
      select: { id: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    await prisma.viontoExport.delete({ where: { id: exportId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("exports/delete", error);
  }
}

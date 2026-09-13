import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { deleteObject } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * DELETE /api/exports/[exportId]
 *
 * Hard-deletes an export record owned by the authenticated user, and its
 * underlying object-storage file. Previously this route only removed the
 * database row — docs/vionto-architecture.md documented the resulting
 * orphaned-storage-object gap explicitly, and this route was unreachable
 * from any UI, so nothing depended on the old (incomplete) behavior.
 *
 * The DB row is removed first: if storage cleanup then fails, the user
 * simply stops seeing the export (no dangling reference to a still-present
 * object) rather than the row surviving with a pointer to nothing.
 * `deleteObject` itself is already best-effort — it no-ops if the object is
 * already gone or never existed — so a failure here is logged, not thrown.
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
      select: { id: true, storageKey: true },
    });

    if (!existing) {
      return NextResponse.json({ error: "Export not found" }, { status: 404 });
    }

    await prisma.viontoExport.delete({ where: { id: exportId } });

    try {
      await deleteObject(existing.storageKey);
    } catch (error) {
      console.error("[exports/delete] storage cleanup failed for", existing.storageKey, error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError("exports/delete", error);
  }
}

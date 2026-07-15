import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { reorderAlbumItemsSchema, formatZodError } from "@/lib/server/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; albumId: string }> };

/**
 * PATCH /api/projects/[projectId]/albums/[albumId]/items/reorder
 *
 * Body: { orderedItemIds: string[] }
 *
 * Reassigns orderIndex values (0, 1, 2…) to album items in the specified order.
 * Only affects this album — other albums are unchanged.
 * All supplied item IDs must belong to this album.
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, albumId } = await params;

    // Verify album ownership.
    const album = await prisma.viontoAlbum.findFirst({
      where: { id: albumId, projectId, userId: user.id },
      select: { id: true },
    });
    if (!album) return badRequest("Album not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = reorderAlbumItemsSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const { orderedItemIds } = parsed.data;

    // Verify all supplied item IDs belong to this album.
    const existingItems = await prisma.viontoAlbumItem.findMany({
      where: { id: { in: orderedItemIds }, albumId },
      select: { id: true },
    });
    const foundIds = new Set(existingItems.map((i) => i.id));
    const unknownIds = orderedItemIds.filter((id) => !foundIds.has(id));
    if (unknownIds.length > 0) {
      return badRequest(`Item IDs not found in album: ${unknownIds.join(", ")}`);
    }

    // Atomic update — one UPDATE per item with its new orderIndex.
    await prisma.$transaction(
      orderedItemIds.map((id, idx) =>
        prisma.viontoAlbumItem.update({
          where: { id },
          data: { orderIndex: idx },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("projects/[projectId]/albums/[albumId]/items/reorder PATCH", error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { Prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { updateAlbumItemSchema, formatZodError } from "@/lib/server/validation";
import { deleteObject } from "@/lib/server/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; albumId: string; itemId: string }> };

async function getOwnedItem(itemId: string, albumId: string, projectId: string, userId: string) {
  return prisma.viontoAlbumItem.findFirst({
    where: {
      id: itemId,
      albumId,
      album: { projectId, userId },
    },
    select: {
      id: true,
      albumId: true,
      assetId: true,
      orderIndex: true,
      metadata: true,
      hidden: true,
      favorite: true,
      album: { select: { isBase: true } },
    },
  });
}

/**
 * PATCH /api/projects/[projectId]/albums/[albumId]/items/[itemId]
 *
 * Update orderIndex, metadata, hidden, or favorite for a single album item.
 * Patching metadata replaces the entire metadata object (merge in the client if needed).
 */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, albumId, itemId } = await params;
    const item = await getOwnedItem(itemId, albumId, projectId, user.id);
    if (!item) return badRequest("Album item not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = updateAlbumItemSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const updated = await prisma.viontoAlbumItem.update({
      where: { id: itemId },
      data: {
        ...(parsed.data.orderIndex !== undefined && { orderIndex: parsed.data.orderIndex }),
        ...(parsed.data.metadata !== undefined && { metadata: parsed.data.metadata === null ? Prisma.DbNull : (parsed.data.metadata as Prisma.InputJsonValue) }),
        ...(parsed.data.hidden !== undefined && { hidden: parsed.data.hidden }),
        ...(parsed.data.favorite !== undefined && { favorite: parsed.data.favorite }),
      },
      select: {
        id: true,
        albumId: true,
        assetId: true,
        orderIndex: true,
        metadata: true,
        hidden: true,
        favorite: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return serverError("projects/[projectId]/albums/[albumId]/items/[itemId] PATCH", error);
  }
}

/**
 * DELETE /api/projects/[projectId]/albums/[albumId]/items/[itemId]
 *
 * Non-base album: removes only the album↔asset link. The source ViontoAsset and
 * its storage object are untouched, so the image stays in the project and any
 * other album.
 *
 * Base album: the base album is the project's canonical image set, so removing
 * here permanently deletes the source ViontoAsset (and its storage objects).
 * The DB-level `onDelete: Cascade` on ViontoAlbumItem.asset then removes the
 * image from every other album automatically.
 */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, albumId, itemId } = await params;
    const item = await getOwnedItem(itemId, albumId, projectId, user.id);
    if (!item) return badRequest("Album item not found.");

    if (item.album.isBase) {
      // Delete the source asset — cascades to every album's item rows.
      const asset = await prisma.viontoAsset.findFirst({
        where: { id: item.assetId, projectId },
        select: { storageKey: true, thumbnailStorageKey: true },
      });
      if (asset?.storageKey) {
        await deleteObject(asset.storageKey).catch((err) => {
          console.error("[DELETE album item] Failed to delete storage object:", err);
        });
      }
      if (
        asset?.thumbnailStorageKey &&
        asset.thumbnailStorageKey !== asset.storageKey
      ) {
        await deleteObject(asset.thumbnailStorageKey).catch((err) => {
          console.error("[DELETE album item] Failed to delete thumbnail object:", err);
        });
      }
      await prisma.viontoAsset.delete({ where: { id: item.assetId } });

      return NextResponse.json({
        ok: true,
        deletedItemId: itemId,
        deletedAssetId: item.assetId,
        cascade: true,
      });
    }

    // Non-base: drop only this album's link.
    await prisma.viontoAlbumItem.delete({ where: { id: itemId } });

    return NextResponse.json({ ok: true, deletedItemId: itemId });
  } catch (error) {
    return serverError("projects/[projectId]/albums/[albumId]/items/[itemId] DELETE", error);
  }
}

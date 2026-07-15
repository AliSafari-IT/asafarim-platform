import { NextResponse } from "next/server";
import { prisma, Prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import {
  addAlbumItemSchema,
  addAlbumItemsBulkSchema,
  formatZodError,
} from "@/lib/server/validation";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; albumId: string }> };

async function getOwnedAlbum(albumId: string, projectId: string, userId: string) {
  return prisma.viontoAlbum.findFirst({
    where: { id: albumId, projectId, userId },
    select: { id: true, isBase: true },
  });
}

/**
 * POST /api/projects/[projectId]/albums/[albumId]/items
 *
 * Body variants:
 *   { assetId, orderIndex?, metadata?, hidden?, favorite? }   — add single item
 *   { assetIds: [...] }                                        — bulk-add (no metadata)
 *
 * Only images that already belong to this project may be added.
 */
export async function POST(req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, albumId } = await params;
    const album = await getOwnedAlbum(albumId, projectId, user.id);
    if (!album) return badRequest("Album not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") return badRequest("JSON body is required.");

    // Detect bulk vs. single by presence of assetIds array.
    if ("assetIds" in (body as object)) {
      // ── Bulk add ──────────────────────────────────────────────
      const parsed = addAlbumItemsBulkSchema.safeParse(body);
      if (!parsed.success) return badRequest(formatZodError(parsed.error));

      const { assetIds } = parsed.data;

      // Validate ownership — assets must belong to this project.
      const validAssets = await prisma.viontoAsset.findMany({
        where: { id: { in: assetIds }, projectId },
        select: { id: true },
      });
      const validIds = new Set(validAssets.map((a) => a.id));
      const invalidIds = assetIds.filter((id) => !validIds.has(id));
      if (invalidIds.length > 0) {
        return badRequest(`Asset IDs not found in project: ${invalidIds.join(", ")}`);
      }

      // Determine next orderIndex.
      const maxOrder = await prisma.viontoAlbumItem.aggregate({
        where: { albumId },
        _max: { orderIndex: true },
      });
      const startIndex = (maxOrder._max.orderIndex ?? -1) + 1;

      await prisma.viontoAlbumItem.createMany({
        data: assetIds.map((assetId, idx) => ({
          albumId,
          assetId,
          orderIndex: startIndex + idx,
        })),
        skipDuplicates: true,
      });

      return NextResponse.json({ ok: true, addedCount: assetIds.length }, { status: 201 });
    }

    // ── Single add ────────────────────────────────────────────
    const parsed = addAlbumItemSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const { assetId, orderIndex, metadata, hidden, favorite } = parsed.data;

    // Validate the asset belongs to this project.
    const asset = await prisma.viontoAsset.findFirst({
      where: { id: assetId, projectId },
      select: { id: true },
    });
    if (!asset) return badRequest("Asset not found in project.");

    // Determine orderIndex if not provided.
    let resolvedOrderIndex = orderIndex;
    if (resolvedOrderIndex === undefined) {
      const maxOrder = await prisma.viontoAlbumItem.aggregate({
        where: { albumId },
        _max: { orderIndex: true },
      });
      resolvedOrderIndex = (maxOrder._max.orderIndex ?? -1) + 1;
    }

    // Check for existing item (duplicate guard).
    const existing = await prisma.viontoAlbumItem.findUnique({
      where: { albumId_assetId: { albumId, assetId } },
    });
    if (existing) return badRequest("This image is already in the album.");

    const item = await prisma.viontoAlbumItem.create({
      data: {
        albumId,
        assetId,
        orderIndex: resolvedOrderIndex,
        metadata: (metadata ?? undefined) as Prisma.InputJsonValue | undefined,
        hidden: hidden ?? false,
        favorite: favorite ?? false,
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

    return NextResponse.json(item, { status: 201 });
  } catch (error) {
    return serverError("projects/[projectId]/albums/[albumId]/items POST", error);
  }
}

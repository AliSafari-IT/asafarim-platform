import { NextResponse } from "next/server";
import { Prisma, prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { formatZodError, promoteSessionSchema } from "@/lib/server/validation";
import { getSessionForUser, deleteSession } from "@/lib/server/upload-session";
import { createPresignedDownloadUrl, deleteObject } from "@/lib/server/storage";
import { advanceAlbumLifecycleStage } from "@/lib/server/album-lifecycle";

/**
 * Lazily ensures a project has a base album and returns its id.
 * Creates the base album if it does not exist yet (handles projects created
 * before the album feature was rolled out).
 */
async function ensureBaseAlbum(projectId: string, userId: string): Promise<string> {
  const existing = await prisma.viontoAlbum.findFirst({
    where: { projectId, isBase: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.viontoAlbum.create({
    data: { projectId, userId, name: "Base album", isBase: true },
    select: { id: true },
  });
  return created.id;
}

export const runtime = "nodejs";

async function getProject(projectId: string, userId: string) {
  return prisma.viontoProject.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      mode: true,
      locale: true,
      aspectRatio: true,
      resolution: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

async function listProjectAssets(projectId: string) {
  const assets = await prisma.viontoAsset.findMany({
    where: { projectId },
    orderBy: { orderIndex: "asc" },
    select: {
      id: true,
      projectId: true,
      userId: true,
      type: true,
      originalUrl: true,
      thumbnailUrl: true,
      storageKey: true,
      thumbnailStorageKey: true,
      width: true,
      height: true,
      fileSizeBytes: true,
      orderIndex: true,
      metadata: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return Promise.all(
    assets.map(async (asset) => {
      const originalUrl = asset.storageKey
        ? await createPresignedDownloadUrl(asset.storageKey, 10 * 60)
        : asset.originalUrl;
      const thumbnailUrl = asset.thumbnailStorageKey
        ? await createPresignedDownloadUrl(asset.thumbnailStorageKey, 10 * 60)
        : originalUrl;

      return {
        ...asset,
        originalUrl,
        thumbnailUrl,
      };
    }),
  );
}

/** GET /api/projects/[projectId]/assets — list assets for a project */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getProject(projectId, user.id);
    if (!project) {
      return badRequest("Project not found.");
    }

    const assets = await listProjectAssets(projectId);

    return NextResponse.json({ assets });
  } catch (error) {
    return serverError("projects/[projectId]/assets", error);
  }
}

/** POST /api/projects/[projectId]/assets — promote session assets to project */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getProject(projectId, user.id);
    if (!project) {
      return badRequest("Project not found.");
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = promoteSessionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const { sessionId, orderedKeys, clearSession = true } = parsed.data;

    // Get session and validate ownership
    const session = getSessionForUser(sessionId, user.id);
    if (!session) {
      return badRequest("Invalid or expired upload session");
    }

    // Determine order
    let orderedAssets = session.assets;
    if (orderedKeys && orderedKeys.length > 0) {
      const keyMap = new Map(session.assets.map((a) => [a.key, a]));
      orderedAssets = orderedKeys
        .map((k) => keyMap.get(k))
        .filter(Boolean) as typeof session.assets;
    }

    if (orderedAssets.length === 0) {
      return badRequest("No assets in session to promote");
    }

    // Determine the current max orderIndex in the project so new assets are appended.
    const maxOrderResult = await prisma.viontoAsset.aggregate({
      where: { projectId },
      _max: { orderIndex: true },
    });
    const baseOrderIndex = (maxOrderResult._max.orderIndex ?? -1) + 1;

    // Create ViontoAsset records
    const createdAssets = await prisma.viontoAsset.createMany({
      data: orderedAssets.map((asset, idx) => ({
        projectId,
        userId: user.id,
        type: "source_image",
        originalUrl: asset.publicUrl,
        thumbnailUrl: asset.thumbnailUrl ?? asset.publicUrl, // fallback to original
        storageKey: asset.key,
        thumbnailStorageKey: asset.thumbnailKey ?? asset.key, // fallback to original
        width: asset.width,
        height: asset.height,
        fileSizeBytes: asset.sizeBytes,
        orderIndex: baseOrderIndex + idx,
        metadata: asset.exif ? ({ exif: asset.exif } as Prisma.InputJsonObject) : Prisma.JsonNull,
      })),
    });

    // Optionally clear the session
    if (clearSession) {
      deleteSession(sessionId);
    }

    // Fetch the created assets to return full objects
    const assets = await listProjectAssets(projectId);

    // Add newly promoted assets to the base album.
    // We look up the assets we just created by key so we have their IDs.
    const promotedKeys = orderedAssets.map((a) => a.key);
    const promotedAssetRows = await prisma.viontoAsset.findMany({
      where: { projectId, storageKey: { in: promotedKeys } },
      orderBy: { orderIndex: "asc" },
      select: { id: true, orderIndex: true },
    });

    if (promotedAssetRows.length > 0) {
      const baseAlbumId = await ensureBaseAlbum(projectId, user.id);

      // Find the current highest orderIndex in the base album so we append correctly.
      const maxAlbumOrder = await prisma.viontoAlbumItem.aggregate({
        where: { albumId: baseAlbumId },
        _max: { orderIndex: true },
      });
      const baseAlbumOrderStart = (maxAlbumOrder._max.orderIndex ?? -1) + 1;

      await prisma.viontoAlbumItem.createMany({
        data: promotedAssetRows.map((asset, idx) => ({
          albumId: baseAlbumId,
          assetId: asset.id,
          orderIndex: baseAlbumOrderStart + idx,
        })),
        skipDuplicates: true,
      });
      await advanceAlbumLifecycleStage(prisma, {
        projectId,
        albumId: baseAlbumId,
        stage: "photos_uploaded",
      });
    }

    return NextResponse.json({
      promotedCount: createdAssets.count,
      assets,
    });
  } catch (error) {
    return serverError("projects/[projectId]/assets", error);
  }
}

/** PATCH /api/projects/[projectId]/assets — reorder assets */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getProject(projectId, user.id);
    if (!project) return badRequest("Project not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    if (
      !body ||
      typeof body !== "object" ||
      !Array.isArray((body as { orderedIds?: unknown }).orderedIds)
    ) {
      return badRequest("orderedIds array is required");
    }

    const { orderedIds } = body as { orderedIds: string[] };

    await prisma.$transaction(
      orderedIds.map((id, idx) =>
        prisma.viontoAsset.updateMany({
          where: { id, projectId, userId: user.id },
          data: { orderIndex: idx },
        })
      )
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return serverError("projects/[projectId]/assets PATCH", error);
  }
}

/** DELETE /api/projects/[projectId]/assets — delete a specific asset */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getProject(projectId, user.id);
    if (!project) {
      return badRequest("Project not found.");
    }

    const { searchParams } = new URL(req.url);
    const assetId = searchParams.get("assetId");
    if (!assetId) {
      return badRequest("Missing assetId parameter.");
    }

    // Get the asset to validate ownership and get storage keys
    const asset = await prisma.viontoAsset.findFirst({
      where: { id: assetId, projectId, userId: user.id },
    });

    if (!asset) {
      return badRequest("Asset not found.");
    }

    // Delete from storage
    if (asset.storageKey) {
      await deleteObject(asset.storageKey).catch((err) => {
        console.error("[DELETE asset] Failed to delete storage object:", err);
      });
    }
    if (asset.thumbnailStorageKey && asset.thumbnailStorageKey !== asset.storageKey) {
      await deleteObject(asset.thumbnailStorageKey).catch((err) => {
        console.error("[DELETE asset] Failed to delete thumbnail storage object:", err);
      });
    }

    // Delete from database
    await prisma.viontoAsset.delete({
      where: { id: assetId },
    });

    return NextResponse.json({ ok: true, deletedAssetId: assetId });
  } catch (error) {
    return serverError("projects/[projectId]/assets DELETE", error);
  }
}

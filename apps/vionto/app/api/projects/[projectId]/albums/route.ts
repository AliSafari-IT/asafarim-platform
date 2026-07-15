import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import {
  createAlbumSchema,
  formatZodError,
} from "@/lib/server/validation";

export const runtime = "nodejs";

/** Shared ownership guard — returns the project or null. */
async function getOwnedProject(projectId: string, userId: string) {
  return prisma.viontoProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

/** Full album select shape reused across GET handlers. */
const ALBUM_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  name: true,
  description: true,
  isBase: true,
  coverAssetId: true,
  metadata: true,
  lifecycleStage: true,
  collections: true,
  isFavorite: true,
  dateFrom: true,
  dateTo: true,
  location: true,
  people: true,
  occasion: true,
  mood: true,
  privacyLevel: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { items: true } },
} as const;

/** GET /api/projects/[projectId]/albums — list all albums for this project. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getOwnedProject(projectId, user.id);
    if (!project) return badRequest("Project not found.");

    // Lazily ensure a base album exists and is populated for pre-feature projects.
    let baseAlbum = await prisma.viontoAlbum.findFirst({
      where: { projectId, isBase: true },
      select: { id: true, _count: { select: { items: true } } },
    });

    if (!baseAlbum) {
      // Project predates the album feature — create the base album.
      const created = await prisma.viontoAlbum.create({
        data: { projectId, userId: user.id, name: "Base album", isBase: true },
        select: { id: true, _count: { select: { items: true } } },
      });
      baseAlbum = created;
    }

    // Back-fill base album items when the album exists but has no item rows
    // (images were uploaded before the asset-promotion hook was in place).
    if (baseAlbum._count.items === 0) {
      const projectAssets = await prisma.viontoAsset.findMany({
        where: { projectId, type: "source_image" },
        orderBy: { orderIndex: "asc" },
        select: { id: true },
      });
      if (projectAssets.length > 0) {
        await prisma.viontoAlbumItem.createMany({
          data: projectAssets.map((a, idx) => ({
            albumId: baseAlbum!.id,
            assetId: a.id,
            orderIndex: idx,
          })),
          skipDuplicates: true,
        });
      }
    }

    const { searchParams } = new URL(req.url);
    const collection = searchParams.get("collection")?.trim().toLowerCase();
    const favoritesOnly = searchParams.get("favorite") === "true";

    const albums = await prisma.viontoAlbum.findMany({
      where: {
        projectId,
        ...(collection ? { collections: { has: collection } } : {}),
        ...(favoritesOnly ? { isFavorite: true } : {}),
      },
      orderBy: [{ isBase: "desc" }, { createdAt: "asc" }],
      select: ALBUM_SELECT,
    });

    return NextResponse.json({ albums });
  } catch (error) {
    return serverError("projects/[projectId]/albums GET", error);
  }
}

/** POST /api/projects/[projectId]/albums — create a new album. */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getOwnedProject(projectId, user.id);
    if (!project) return badRequest("Project not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = createAlbumSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const {
      name, description, fromBase, assetIds, coverAssetId, metadata,
      lifecycleStage, collections, isFavorite,
      dateFrom, dateTo, location, people, occasion, mood, privacyLevel,
    } = parsed.data;

    // Resolve which asset IDs to seed the album with.
    let seedAssetIds: string[] = [];

    if (fromBase) {
      // Locate (or lazily create) the base album.
      let baseAlbumId: string | null = null;
      const baseAlbum = await prisma.viontoAlbum.findFirst({
        where: { projectId, isBase: true },
        select: { id: true },
      });
      if (baseAlbum) {
        baseAlbumId = baseAlbum.id;
      } else {
        // Project predates the album feature — create the base album now.
        const created = await prisma.viontoAlbum.create({
          data: { projectId, userId: user.id, name: "Base album", isBase: true },
          select: { id: true },
        });
        baseAlbumId = created.id;
      }

      // Try to get items from the base album first.
      const baseItems = await prisma.viontoAlbumItem.findMany({
        where: { albumId: baseAlbumId },
        orderBy: { orderIndex: "asc" },
        select: { assetId: true },
      });
      seedAssetIds = baseItems.map((i) => i.assetId);

      // Base album exists but has no items — project pre-dates the upload hook.
      // Fall back to the project's ViontoAsset table and back-fill the base album
      // so future operations see a complete picture.
      if (seedAssetIds.length === 0) {
        const projectAssets = await prisma.viontoAsset.findMany({
          where: { projectId, type: "source_image" },
          orderBy: { orderIndex: "asc" },
          select: { id: true },
        });
        seedAssetIds = projectAssets.map((a) => a.id);

        if (seedAssetIds.length > 0) {
          await prisma.viontoAlbumItem.createMany({
            data: seedAssetIds.map((assetId, idx) => ({
              albumId: baseAlbumId!,
              assetId,
              orderIndex: idx,
            })),
            skipDuplicates: true,
          });
        }
      }
    } else if (assetIds && assetIds.length > 0) {
      // Validate that the supplied asset IDs actually belong to this project.
      const validAssets = await prisma.viontoAsset.findMany({
        where: { id: { in: assetIds }, projectId },
        select: { id: true, orderIndex: true },
        orderBy: { orderIndex: "asc" },
      });
      seedAssetIds = validAssets.map((a) => a.id);
    }

    // Create album + seed items in a transaction.
    const album = await prisma.$transaction(async (tx) => {
      const created = await tx.viontoAlbum.create({
        data: {
          projectId,
          userId: user.id,
          name,
          description,
          isBase: false,
          coverAssetId: coverAssetId ?? null,
          metadata: metadata ?? undefined,
          lifecycleStage: lifecycleStage ?? (seedAssetIds.length > 0 ? "photos_uploaded" : "draft"),
          collections: isFavorite ? Array.from(new Set([...(collections ?? []), "favorites"])) : collections,
          isFavorite,
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          location: location ?? undefined,
          people: people ?? undefined,
          occasion: occasion ?? undefined,
          mood: mood ?? undefined,
          privacyLevel,
        },
        select: ALBUM_SELECT,
      });

      if (seedAssetIds.length > 0) {
        await tx.viontoAlbumItem.createMany({
          data: seedAssetIds.map((assetId, idx) => ({
            albumId: created.id,
            assetId,
            orderIndex: idx,
          })),
          skipDuplicates: true,
        });
      }

      return created;
    });

    return NextResponse.json(album, { status: 201 });
  } catch (error) {
    return serverError("projects/[projectId]/albums POST", error);
  }
}

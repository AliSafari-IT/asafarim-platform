import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { createPresignedDownloadUrl } from "@/lib/server/storage";

export const runtime = "nodejs";

/**
 * GET /api/dashboard
 *
 * Returns an aggregate dashboard overview for the current user:
 * - Recent albums (across all projects)
 * - In-progress render jobs
 * - Recent completed exports
 * - Storage & usage stats
 * - Quick-create links
 */
export async function GET() {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    // Run all queries in parallel for speed
    const [
      projectsWithAlbums,
      inProgressJobs,
      recentExports,
      storageStats,
      totalCounts,
    ] = await Promise.all([
      // 1. Recent albums across all projects (up to 12)
      prisma.viontoAlbum.findMany({
        where: { project: { userId: user.id } },
        orderBy: { updatedAt: "desc" },
        take: 12,
        select: {
          id: true,
          projectId: true,
          name: true,
          isBase: true,
          coverAssetId: true,
          lifecycleStage: true,
          dateFrom: true,
          dateTo: true,
          location: true,
          occasion: true,
          mood: true,
          createdAt: true,
          updatedAt: true,
          _count: { select: { items: true } },
          project: {
            select: {
              id: true,
              title: true,
              _count: { select: { videoVersions: true, exports: true } },
            },
          },
        },
      }),

      // 2. In-progress render jobs (queued, processing)
      prisma.viontoRenderJob.findMany({
        where: {
          userId: user.id,
          state: { in: ["queued", "processing"] },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          projectId: true,
          versionId: true,
          state: true,
          progressPercent: true,
          errorSummary: true,
          createdAt: true,
          project: { select: { title: true } },
          version: { select: { name: true } },
        },
      }),

      // 3. Recent completed exports (up to 8)
      prisma.viontoExport.findMany({
        where: {
          userId: user.id,
          renderJob: { state: "completed" },
        },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: {
          id: true,
          projectId: true,
          versionId: true,
          storageKey: true,
          filename: true,
          format: true,
          resolution: true,
          durationSeconds: true,
          fileSizeBytes: true,
          userMode: true,
          aspectRatio: true,
          visualStyle: true,
          previewTitle: true,
          previewSubtitle: true,
          createdAt: true,
          project: { select: { title: true } },
          version: { select: { name: true } },
        },
      }),

      // 4. Storage usage — sum of all asset file sizes
      prisma.viontoAsset.aggregate({
        where: { project: { userId: user.id } },
        _sum: { fileSizeBytes: true },
        _count: true,
      }),

      // 5. Total counts for summary cards
      Promise.all([
        prisma.viontoProject.count({ where: { userId: user.id } }),
        prisma.viontoAlbum.count({ where: { project: { userId: user.id } } }),
        prisma.viontoVideoVersion.count({ where: { userId: user.id } }),
        prisma.viontoExport.count({
          where: { userId: user.id, renderJob: { state: "completed" } },
        }),
        prisma.viontoRenderJob.count({
          where: { userId: user.id, state: { in: ["queued", "processing"] } },
        }),
      ]),
    ]);

    // Generate presigned URLs for recent exports
    const exportsWithUrls = await Promise.all(
      recentExports.map(async (exp) => ({
        id: exp.id,
        projectId: exp.projectId,
        versionId: exp.versionId,
        projectTitle: exp.project.title,
        versionName: exp.version?.name ?? null,
        filename: exp.filename,
        format: exp.format,
        resolution: exp.resolution,
        durationSeconds: exp.durationSeconds,
        fileSizeBytes: exp.fileSizeBytes,
        mode: exp.userMode,
        aspectRatio: exp.aspectRatio,
        visualStyle: exp.visualStyle,
        previewTitle: exp.previewTitle,
        previewSubtitle: exp.previewSubtitle,
        createdAt: exp.createdAt,
        previewUrl: await createPresignedDownloadUrl(exp.storageKey, 10 * 60).catch(() => null),
      })),
    );

    // Get cover image URLs for albums
    const coverAssetIds = projectsWithAlbums
      .map((a) => a.coverAssetId)
      .filter((id): id is string => !!id);
    const coverAssets = coverAssetIds.length > 0
      ? await prisma.viontoAsset.findMany({
          where: { id: { in: coverAssetIds } },
          select: { id: true, thumbnailStorageKey: true, storageKey: true },
        })
      : [];

    const coverUrlMap = new Map<string, string>();
    await Promise.all(
      coverAssets.map(async (asset) => {
        const key = asset.thumbnailStorageKey ?? asset.storageKey;
        if (key) {
          const url = await createPresignedDownloadUrl(key, 10 * 60).catch(() => null);
          if (url) coverUrlMap.set(asset.id, url);
        }
      }),
    );

    const albums = projectsWithAlbums.map((album) => ({
      id: album.id,
      projectId: album.projectId,
      projectTitle: album.project.title,
      name: album.name,
      isBase: album.isBase,
      lifecycleStage: album.lifecycleStage,
      photoCount: album._count.items,
      videoVersionCount: album.project._count.videoVersions,
      exportCount: album.project._count.exports,
      coverUrl: album.coverAssetId ? coverUrlMap.get(album.coverAssetId) ?? null : null,
      dateFrom: album.dateFrom,
      dateTo: album.dateTo,
      location: album.location,
      occasion: album.occasion,
      mood: album.mood,
      createdAt: album.createdAt,
      updatedAt: album.updatedAt,
    }));

    const [projectCount, albumCount, versionCount, exportCount, activeRenderCount] = totalCounts;

    return NextResponse.json({
      albums,
      inProgressRenders: inProgressJobs.map((job) => ({
        id: job.id,
        projectId: job.projectId,
        versionId: job.versionId,
        projectTitle: job.project.title,
        versionName: job.version?.name ?? null,
        state: job.state,
        progressPercent: job.progressPercent,
        errorSummary: job.errorSummary,
        createdAt: job.createdAt,
      })),
      recentExports: exportsWithUrls,
      stats: {
        projectCount,
        albumCount,
        versionCount,
        exportCount,
        activeRenderCount,
        storageUsedBytes: storageStats._sum.fileSizeBytes ?? 0,
        totalAssets: storageStats._count,
      },
    });
  } catch (error) {
    return serverError("dashboard", error);
  }
}

import { prisma } from "@asafarim/db";
import type { ActivityEntry, ActivityLookup, ActivitySection, UserActivityAdapter } from "../types";

function viontoUrl(): string {
  return process.env.NEXT_PUBLIC_VIONTO_URL ?? "http://localhost:3004";
}

/**
 * Vionto (photo-to-story video pipeline) is the flagship activity adapter:
 * projects, render jobs (state/progress/error), exports (format/resolution/
 * duration/size), albums, and storage usage — read-only, keyed by userId.
 */
export const viontoActivityAdapter: UserActivityAdapter = {
  app: "vionto",

  async getActivity({ userId }: ActivityLookup): Promise<ActivitySection> {
    const base = viontoUrl();

    const [projects, renderJobs, exports, albums, storageMetrics] = await Promise.all([
      prisma.viontoProject.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { id: true, title: true, status: true, createdAt: true, updatedAt: true },
      }),
      prisma.viontoRenderJob.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          state: true,
          progressPercent: true,
          errorSummary: true,
          retryCount: true,
          startedAt: true,
          completedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.viontoExport.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          format: true,
          resolution: true,
          durationSeconds: true,
          fileSizeBytes: true,
          filename: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.viontoAlbum.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          projectId: true,
          name: true,
          lifecycleStage: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.viontoUsageMetric.findMany({
        where: { userId, metric: "storage_mb" },
        orderBy: { periodStart: "desc" },
        take: 1,
        select: { value: true, periodStart: true, periodEnd: true },
      }),
    ]);

    const entries: ActivityEntry[] = [
      ...projects.map(
        (p): ActivityEntry => ({
          id: p.id,
          app: "vionto",
          type: "project",
          title: p.title,
          status: p.status,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          href: `${base}/projects/${p.id}`,
          metadata: {},
        })
      ),
      ...renderJobs.map(
        (j): ActivityEntry => ({
          id: j.id,
          app: "vionto",
          type: "render_job",
          title: `Render job (${j.progressPercent}%)`,
          status: j.state,
          createdAt: j.createdAt,
          updatedAt: j.updatedAt,
          href: `${base}/projects/${j.projectId}`,
          metadata: {
            progressPercent: j.progressPercent,
            errorSummary: j.errorSummary,
            retryCount: j.retryCount,
            startedAt: j.startedAt,
            completedAt: j.completedAt,
          },
        })
      ),
      ...exports.map(
        (e): ActivityEntry => ({
          id: e.id,
          app: "vionto",
          type: "export",
          title: e.filename ?? `Export (${e.format})`,
          status: "exported",
          createdAt: e.createdAt,
          updatedAt: e.updatedAt,
          href: `${base}/projects/${e.projectId}`,
          metadata: {
            format: e.format,
            resolution: e.resolution,
            durationSeconds: e.durationSeconds,
            fileSizeBytes: e.fileSizeBytes,
          },
        })
      ),
      ...albums.map(
        (a): ActivityEntry => ({
          id: a.id,
          app: "vionto",
          type: "album",
          title: a.name,
          status: a.lifecycleStage,
          createdAt: a.createdAt,
          updatedAt: a.updatedAt,
          href: `${base}/projects/${a.projectId}`,
          metadata: {},
        })
      ),
    ];

    const storage = storageMetrics[0];

    return {
      app: "vionto",
      supported: true,
      available: true,
      entries,
      summary: storage
        ? {
            storageMb: storage.value,
            periodStart: storage.periodStart,
            periodEnd: storage.periodEnd,
          }
        : undefined,
    };
  },
};

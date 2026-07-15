import type { PrismaClient } from "@asafarim/db";

export const ALBUM_LIFECYCLE_STAGES = [
  "draft",
  "photos_uploaded",
  "story_generated",
  "audio_ready",
  "video_rendered",
  "published_exported",
] as const;

export type AlbumLifecycleStage = (typeof ALBUM_LIFECYCLE_STAGES)[number];

const STAGE_RANK: Record<AlbumLifecycleStage, number> = {
  draft: 0,
  photos_uploaded: 1,
  story_generated: 2,
  audio_ready: 3,
  video_rendered: 4,
  published_exported: 5,
};

export async function advanceAlbumLifecycleStage(
  prisma: PrismaClient,
  input: { projectId: string; albumId?: string | null; stage: AlbumLifecycleStage },
) {
  const { projectId, albumId, stage } = input;
  const albums = await prisma.viontoAlbum.findMany({
    where: albumId ? { id: albumId, projectId } : { projectId, isBase: true },
    select: { id: true, lifecycleStage: true },
  });

  await Promise.all(
    albums
      .filter((album) => STAGE_RANK[stage] > STAGE_RANK[(album.lifecycleStage as AlbumLifecycleStage) ?? "draft"])
      .map((album) =>
        prisma.viontoAlbum.update({
          where: { id: album.id },
          data: { lifecycleStage: stage },
        }),
      ),
  );
}

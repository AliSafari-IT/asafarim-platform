import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { Prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { createAiClipsSchema, formatZodError } from "@/lib/server/validation";
import {
  isKlingConfigured,
  createImageToVideoTask,
  getImageToVideoTask,
  downloadClip,
  KlingApiError,
} from "@/lib/server/kling";
import {
  buildKey,
  createPresignedDownloadUrl,
  getObjectBytes,
  getStorageStatus,
  putObjectBytes,
  MAX_METADATA_FETCH_BYTES,
} from "@/lib/server/storage";

export const runtime = "nodejs";

/** Shared negative prompt guarding against typical i2v artifacts. */
const DEFAULT_NEGATIVE_PROMPT =
  "distorted faces, changed identity, extra people, extra limbs, warped geometry, " +
  "flicker, sudden camera movement, text, watermark, blur";

const CLIP_SELECT = {
  id: true,
  projectId: true,
  versionId: true,
  albumId: true,
  albumItemId: true,
  assetId: true,
  provider: true,
  model: true,
  mode: true,
  prompt: true,
  negativePrompt: true,
  durationSeconds: true,
  taskId: true,
  status: true,
  errorMessage: true,
  outputStorageKey: true,
  outputDurationSeconds: true,
  accepted: true,
  createdAt: true,
  updatedAt: true,
} as const;

async function getOwnedProject(projectId: string, userId: string) {
  return prisma.viontoProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
}

/** Resolve the image reference Kling receives: a short-lived presigned URL
 *  when object storage is remote, otherwise raw base64 (local dev). */
async function buildKlingImageInput(storageKey: string): Promise<string> {
  const status = getStorageStatus();
  if (status.configured) {
    return createPresignedDownloadUrl(storageKey, 15 * 60);
  }
  const bytes = await getObjectBytes(storageKey, MAX_METADATA_FETCH_BYTES * 16);
  if (!bytes) throw new Error(`Image object not found: ${storageKey}`);
  return bytes.toString("base64");
}

/** Attach a short-lived preview URL to finished clips. */
async function withPreviewUrls<T extends { status: string; outputStorageKey: string | null }>(
  clips: T[]
): Promise<Array<T & { previewUrl: string | null }>> {
  return Promise.all(
    clips.map(async (clip) => ({
      ...clip,
      previewUrl:
        clip.status === "succeeded" && clip.outputStorageKey
          ? await createPresignedDownloadUrl(clip.outputStorageKey).catch(() => null)
          : null,
    }))
  );
}

/**
 * POST /api/projects/[projectId]/ai-clips
 *
 * Submit Kling image-to-video generation for up to 3 selected album images.
 * Tasks are submitted sequentially; each failure is recorded on its own clip
 * row without aborting the batch.
 */
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

    if (!isKlingConfigured()) {
      return NextResponse.json(
        { error: "AI motion generation is not configured on this server." },
        { status: 503 }
      );
    }

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = createAiClipsSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));
    const input = parsed.data;

    if (input.versionId) {
      const version = await prisma.viontoVideoVersion.findFirst({
        where: { id: input.versionId, projectId },
        select: { id: true },
      });
      if (!version) return badRequest("Video version not found.");
    }
    if (input.albumId) {
      const album = await prisma.viontoAlbum.findFirst({
        where: { id: input.albumId, projectId },
        select: { id: true },
      });
      if (!album) return badRequest("Album not found.");
    }

    // Every referenced asset must be an owned source image with storage.
    const assetIds = input.items.map((item) => item.assetId);
    const assets = await prisma.viontoAsset.findMany({
      where: { id: { in: assetIds }, projectId, type: "source_image" },
      select: { id: true, storageKey: true },
    });
    const assetById = new Map(assets.map((a) => [a.id, a]));
    for (const item of input.items) {
      const asset = assetById.get(item.assetId);
      if (!asset || !asset.storageKey) {
        return badRequest(`Image ${item.assetId} not found in this project.`);
      }
    }

    const created: Array<Record<string, unknown>> = [];
    for (const item of input.items) {
      const asset = assetById.get(item.assetId)!;
      const clip = await prisma.viontoAiClip.create({
        data: {
          projectId,
          userId: user.id,
          versionId: input.versionId ?? null,
          albumId: input.albumId ?? null,
          albumItemId: item.albumItemId ?? null,
          assetId: item.assetId,
          provider: "kling",
          model: process.env.KLING_MODEL?.trim() || "kling-v1-6",
          mode: input.mode,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT,
          durationSeconds: input.durationSeconds,
          status: "pending",
        },
        select: CLIP_SELECT,
      });

      try {
        const imageInput = await buildKlingImageInput(asset.storageKey!);
        const task = await createImageToVideoTask({
          imageUrl: imageInput,
          prompt: input.prompt,
          negativePrompt: input.negativePrompt ?? DEFAULT_NEGATIVE_PROMPT,
          mode: input.mode,
          durationSeconds: input.durationSeconds,
          externalTaskId: clip.id,
        });
        const updated = await prisma.viontoAiClip.update({
          where: { id: clip.id },
          data: { taskId: task.taskId, status: "submitted" },
          select: CLIP_SELECT,
        });
        created.push(updated);
      } catch (error) {
        const message =
          error instanceof KlingApiError
            ? `Kling error ${error.code}: ${error.message}`
            : error instanceof Error
              ? error.message
              : String(error);
        const failed = await prisma.viontoAiClip.update({
          where: { id: clip.id },
          data: { status: "failed", errorMessage: message },
          select: CLIP_SELECT,
        });
        created.push(failed);
      }
    }

    return NextResponse.json({ clips: created }, { status: 201 });
  } catch (error) {
    return serverError("projects/[projectId]/ai-clips POST", error);
  }
}

/**
 * GET /api/projects/[projectId]/ai-clips?versionId=&albumId=
 *
 * List AI clips. In-flight tasks are refreshed against Kling; completed
 * results are downloaded to our own storage before their temporary URL
 * expires. Finished clips include a short-lived preview URL.
 */
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

    const url = new URL(req.url);
    const versionId = url.searchParams.get("versionId");
    const albumId = url.searchParams.get("albumId");

    const where = {
      projectId,
      ...(versionId ? { versionId } : {}),
      ...(albumId ? { albumId } : {}),
    };

    // Refresh in-flight tasks (bounded so a big backlog can't stall the request).
    const inFlight = await prisma.viontoAiClip.findMany({
      where: { ...where, status: { in: ["submitted", "processing"] }, taskId: { not: null } },
      orderBy: { createdAt: "asc" },
      select: { id: true, taskId: true, userId: true },
      take: 6,
    });

    for (const clip of inFlight) {
      try {
        const task = await getImageToVideoTask(clip.taskId!);
        if (task.status === "succeed") {
          const video = task.videos[0];
          if (!video?.url) {
            await prisma.viontoAiClip.update({
              where: { id: clip.id },
              data: { status: "failed", errorMessage: "Kling reported success without a video URL." },
            });
            continue;
          }
          // Persist immediately — the provider URL is temporary.
          const bytes = await downloadClip(video.url);
          const key = buildKey(clip.userId, "renders", projectId, `ai-clip-${clip.id}.mp4`);
          await putObjectBytes(key, bytes, "video/mp4");
          await prisma.viontoAiClip.update({
            where: { id: clip.id },
            data: {
              status: "succeeded",
              outputStorageKey: key,
              outputDurationSeconds: video.duration,
              providerMetadata: task.raw as Prisma.InputJsonValue,
            },
          });
        } else if (task.status === "failed") {
          await prisma.viontoAiClip.update({
            where: { id: clip.id },
            data: {
              status: "failed",
              errorMessage: task.statusMessage ?? "Generation failed.",
              providerMetadata: task.raw as Prisma.InputJsonValue,
            },
          });
        } else if (task.status === "processing") {
          await prisma.viontoAiClip.update({
            where: { id: clip.id },
            data: { status: "processing" },
          });
        }
      } catch (error) {
        // Polling errors are transient — leave the clip in its current state.
        console.error(`[ai-clips] Poll failed for clip ${clip.id}:`, error);
      }
    }

    const clips = await prisma.viontoAiClip.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: CLIP_SELECT,
      take: 100,
    });

    return NextResponse.json({ clips: await withPreviewUrls(clips) });
  } catch (error) {
    return serverError("projects/[projectId]/ai-clips GET", error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { advanceAlbumLifecycleStage } from "@/lib/server/album-lifecycle";

export const runtime = "nodejs";

/**
 * GET /api/audio/tracks?projectId={pid}
 *
 * List audio tracks for a project.
 */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");
    if (!projectId) {
      return badRequest("projectId query parameter is required.");
    }

    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return badRequest("Project not found.");
    }

    const tracks = await prisma.viontoAudioTrack.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ data: tracks, tracks });
  } catch (error) {
    return serverError("audio/tracks", error);
  }
}

/**
 * POST /api/audio/tracks
 *
 * Create an audio track for a project.
 */
export async function POST(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const projectId = body.projectId;
    if (typeof projectId !== "string" || !projectId) {
      return badRequest("projectId is required.");
    }

    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      return badRequest("Project not found.");
    }

    const versionId = typeof body.versionId === "string" ? body.versionId : null;
    const type = String(body.type ?? "narration");
    const source = String(body.source ?? "upload");
    const storageKey = typeof body.storageKey === "string" ? body.storageKey : null;
    const voiceId = typeof body.voiceId === "string" ? body.voiceId : null;
    const voiceName = typeof body.voiceName === "string" ? body.voiceName : null;
    const durationSeconds = typeof body.durationSeconds === "number" ? body.durationSeconds : null;
    const mixSettings = body.mixSettings ?? {};

    const existingPreference = voiceId
      ? await prisma.viontoAudioTrack.findFirst({
          where: {
            projectId,
            userId: user.id,
            type: "narration",
            source: "tts",
            storageKey: null,
            ...(versionId ? { versionId } : {}),
          },
          orderBy: { updatedAt: "desc" },
        })
      : null;

    const track = existingPreference
      ? await prisma.viontoAudioTrack.update({
          where: { id: existingPreference.id },
          data: { voiceId, voiceName, durationSeconds, mixSettings },
        })
      : await prisma.viontoAudioTrack.create({
          data: {
            projectId,
            versionId,
            userId: user.id,
            type,
            source,
            storageKey,
            voiceId,
            voiceName,
            durationSeconds,
            mixSettings,
          },
        });

    const version = versionId
      ? await prisma.viontoVideoVersion.findFirst({
          where: { id: versionId, projectId },
          select: { albumId: true },
        })
      : null;
    await advanceAlbumLifecycleStage(prisma, {
      projectId,
      albumId: version?.albumId ?? null,
      stage: "audio_ready",
    });

    return NextResponse.json(track, { status: 201 });
  } catch (error) {
    return serverError("audio/tracks", error);
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";

export const runtime = "nodejs";

async function getTrack(trackId: string, userId: string) {
  return prisma.viontoAudioTrack.findFirst({
    where: { id: trackId, userId },
    include: { project: { select: { id: true } } },
  });
}

/** PUT /api/audio/tracks/[trackId] — update track metadata/mix settings */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { trackId } = await params;
    const existing = await getTrack(trackId, user.id);
    if (!existing) {
      return badRequest("Audio track not found.");
    }

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const data: Record<string, unknown> = {};
    if (typeof body.type === "string") data.type = body.type;
    if (typeof body.source === "string") data.source = body.source;
    if (typeof body.storageKey === "string" || body.storageKey === null) data.storageKey = body.storageKey;
    if (typeof body.voiceId === "string" || body.voiceId === null) data.voiceId = body.voiceId;
    if (typeof body.voiceName === "string" || body.voiceName === null) data.voiceName = body.voiceName;
    if (typeof body.durationSeconds === "number" || body.durationSeconds === null)
      data.durationSeconds = body.durationSeconds;
    if (body.mixSettings !== undefined) data.mixSettings = body.mixSettings;

    const updated = await prisma.viontoAudioTrack.update({
      where: { id: trackId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    return serverError("audio/tracks/[trackId]", error);
  }
}

/** DELETE /api/audio/tracks/[trackId] — delete a track */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ trackId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { trackId } = await params;
    const existing = await getTrack(trackId, user.id);
    if (!existing) {
      return badRequest("Audio track not found.");
    }

    await prisma.viontoAudioTrack.delete({ where: { id: trackId } });
    return NextResponse.json({ id: trackId, deleted: true });
  } catch (error) {
    return serverError("audio/tracks/[trackId]", error);
  }
}

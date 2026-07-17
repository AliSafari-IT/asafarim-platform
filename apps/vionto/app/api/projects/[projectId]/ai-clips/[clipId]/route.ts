import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { updateAiClipSchema, formatZodError } from "@/lib/server/validation";
import { createPresignedDownloadUrl, deleteObject } from "@/lib/server/storage";

export const runtime = "nodejs";

type Params = { params: Promise<{ projectId: string; clipId: string }> };

async function getOwnedClip(clipId: string, projectId: string, userId: string) {
  return prisma.viontoAiClip.findFirst({
    where: { id: clipId, projectId, userId, project: { userId } },
  });
}

/** GET /api/projects/[projectId]/ai-clips/[clipId] — single clip with preview URL. */
export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, clipId } = await params;
    const clip = await getOwnedClip(clipId, projectId, user.id);
    if (!clip) return badRequest("Clip not found.");

    const previewUrl =
      clip.status === "succeeded" && clip.outputStorageKey
        ? await createPresignedDownloadUrl(clip.outputStorageKey).catch(() => null)
        : null;

    return NextResponse.json({ ...clip, previewUrl });
  } catch (error) {
    return serverError("projects/[projectId]/ai-clips/[clipId] GET", error);
  }
}

/** PATCH — toggle whether the clip is used in the final render. */
export async function PATCH(req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, clipId } = await params;
    const clip = await getOwnedClip(clipId, projectId, user.id);
    if (!clip) return badRequest("Clip not found.");

    const body = (await req.json().catch(() => null)) as unknown;
    const parsed = updateAiClipSchema.safeParse(body);
    if (!parsed.success) return badRequest(formatZodError(parsed.error));

    const updated = await prisma.viontoAiClip.update({
      where: { id: clip.id },
      data: { accepted: parsed.data.accepted },
    });

    return NextResponse.json(updated);
  } catch (error) {
    return serverError("projects/[projectId]/ai-clips/[clipId] PATCH", error);
  }
}

/** DELETE — remove the clip record and its stored video. */
export async function DELETE(_req: Request, { params }: Params) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, clipId } = await params;
    const clip = await getOwnedClip(clipId, projectId, user.id);
    if (!clip) return badRequest("Clip not found.");

    if (clip.outputStorageKey) {
      await deleteObject(clip.outputStorageKey).catch(() => null);
    }
    await prisma.viontoAiClip.delete({ where: { id: clip.id } });

    return NextResponse.json({ ok: true, deletedClipId: clip.id });
  } catch (error) {
    return serverError("projects/[projectId]/ai-clips/[clipId] DELETE", error);
  }
}

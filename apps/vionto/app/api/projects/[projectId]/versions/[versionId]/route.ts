import { NextResponse } from "next/server";
import { Prisma, prisma } from "@asafarim/db";
import {
  getAuthedUser,
  unauthorized,
  badRequest,
  forbidden,
  notFound,
  serverError,
} from "@/lib/server/auth";
import { updateVideoVersionSchema, formatZodError } from "@/lib/server/validation";
import { getVideoTemplate } from "@/lib/video-templates";

export const runtime = "nodejs";

const VERSION_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  albumId: true,
  name: true,
  templateId: true,
  templateSettings: true,
  mode: true,
  storyMode: true,
  emotionalTone: true,
  visualStyle: true,
  subtitleSettings: true,
  musicOption: true,
  musicTrackId: true,
  musicUploadKey: true,
  musicMetadata: true,
  aspectRatio: true,
  resolution: true,
  targetDurationSeconds: true,
  storyStructure: true,
  captionOverlaySettings: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { scripts: true, renderJobs: true, exports: true } },
  album: { select: { id: true, name: true, isBase: true } },
} as const;

type RouteParams = { params: Promise<{ projectId: string; versionId: string }> };

/** GET /api/projects/[projectId]/versions/[versionId] */
export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, versionId } = await params;

    // Verify project access
    const project = await prisma.viontoProject.findFirst({
      where: {
        id: projectId,
        OR: [
          { userId: user.id },
          { shares: { some: { OR: [{ sharedWithUserId: user.id }, { email: user.email }] } } },
        ],
      },
      select: { id: true },
    });
    if (!project) return notFound();

    const version = await prisma.viontoVideoVersion.findFirst({
      where: { id: versionId, projectId },
      select: VERSION_SELECT,
    });
    if (!version) return notFound();

    return NextResponse.json(version);
  } catch (error) {
    return serverError("versions/[versionId]", error);
  }
}

/** PATCH /api/projects/[projectId]/versions/[versionId] — update version settings */
export async function PATCH(req: Request, { params }: RouteParams) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, versionId } = await params;

    // Only owner can update
    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      const exists = await prisma.viontoProject.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      return exists ? forbidden("Only the project owner can edit versions.") : notFound();
    }

    const version = await prisma.viontoVideoVersion.findFirst({
      where: { id: versionId, projectId },
      select: { id: true },
    });
    if (!version) return notFound();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const parsed = updateVideoVersionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    // Validate albumId if being changed
    if (parsed.data.albumId) {
      const album = await prisma.viontoAlbum.findFirst({
        where: { id: parsed.data.albumId, projectId },
        select: { id: true },
      });
      if (!album) return badRequest("Album not found.");
    }

    const template = getVideoTemplate(parsed.data.templateId);

    // Transform null JSON values for Prisma compatibility
    const updateData: Record<string, unknown> = {
      ...(template ? { ...template.settings, templateId: template.id, templateSettings: template.settings } : {}),
      ...parsed.data,
    };
    if (parsed.data.templateId === null) {
      updateData.templateSettings = Prisma.JsonNull;
    }
    for (const key of ["storyStructure", "captionOverlaySettings", "subtitleSettings", "musicMetadata", "templateSettings"] as const) {
      if (key in updateData && updateData[key] === null) {
        updateData[key] = Prisma.JsonNull;
      }
    }

    const updated = await prisma.viontoVideoVersion.update({
      where: { id: versionId },
      data: updateData as any,
      select: VERSION_SELECT,
    });

    // Also sync creative settings back to the project for backward compat
    // (only for the fields that were updated).
    const projectSyncData: Record<string, unknown> = {};
    const syncFields = [
      "mode", "storyMode", "emotionalTone", "visualStyle",
      "subtitleSettings", "musicOption", "musicTrackId",
      "musicUploadKey", "musicMetadata", "aspectRatio",
      "resolution", "targetDurationSeconds",
    ] as const;
    for (const field of syncFields) {
      if (field in parsed.data) {
        projectSyncData[field] = parsed.data[field as keyof typeof parsed.data];
      }
    }
    if (Object.keys(projectSyncData).length > 0) {
      await prisma.viontoProject.update({
        where: { id: projectId },
        data: projectSyncData,
      }).catch(() => null); // Best-effort sync
    }

    return NextResponse.json(updated);
  } catch (error) {
    return serverError("versions/[versionId]", error);
  }
}

export async function PUT(req: Request, context: RouteParams) {
  return PATCH(req, context);
}

/** DELETE /api/projects/[projectId]/versions/[versionId] — owner only */
export async function DELETE(_req: Request, { params }: RouteParams) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId, versionId } = await params;

    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) {
      const exists = await prisma.viontoProject.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      return exists ? forbidden("Only the project owner can delete versions.") : notFound();
    }

    // Don't allow deleting the last version
    const versionCount = await prisma.viontoVideoVersion.count({ where: { projectId } });
    if (versionCount <= 1) {
      return badRequest("Cannot delete the only video version. Create another version first.");
    }

    await prisma.viontoVideoVersion.delete({ where: { id: versionId } });
    return NextResponse.json({ id: versionId, deleted: true });
  } catch (error) {
    return serverError("versions/[versionId]", error);
  }
}

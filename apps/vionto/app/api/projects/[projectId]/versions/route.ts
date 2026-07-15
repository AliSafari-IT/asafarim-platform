import { NextResponse } from "next/server";
import { Prisma, prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { createVideoVersionSchema, formatZodError } from "@/lib/server/validation";
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
} as const;

/** GET /api/projects/[projectId]/versions — list all video versions */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;

    // Verify project access (owner or shared)
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
    if (!project) return badRequest("Project not found.");

    const versions = await prisma.viontoVideoVersion.findMany({
      where: { projectId },
      orderBy: { createdAt: "asc" },
      select: VERSION_SELECT,
    });

    return NextResponse.json({ data: versions });
  } catch (error) {
    return serverError("versions", error);
  }
}

/** POST /api/projects/[projectId]/versions — create a new video version */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;

    // Verify project ownership
    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) return badRequest("Project not found.");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const parsed = createVideoVersionSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const { cloneFromVersionId, ...data } = parsed.data;

    // If cloning, copy settings from the source version
    let cloneData: Record<string, unknown> = {};
    if (cloneFromVersionId) {
      const source = await prisma.viontoVideoVersion.findFirst({
        where: { id: cloneFromVersionId, projectId },
        select: {
          albumId: true,
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
        },
      });
      if (!source) return badRequest("Source version not found.");
      cloneData = { ...source };
    }

    const template = getVideoTemplate(data.templateId);
    const templateData = template
      ? {
          ...template.settings,
          templateId: template.id,
          templateSettings: template.settings,
        }
      : {};

    // Validate albumId if provided
    const effectiveAlbumId = data.albumId ?? (cloneData.albumId as string | null) ?? null;
    if (effectiveAlbumId) {
      const album = await prisma.viontoAlbum.findFirst({
        where: { id: effectiveAlbumId, projectId },
        select: { id: true },
      });
      if (!album) return badRequest("Album not found.");
    }

    // Transform null JSON values for Prisma compatibility
    const createData: Record<string, unknown> = {
      projectId,
      userId: user.id,
      ...cloneData,
      ...templateData,
      ...data,
      templateId: data.templateId ?? (templateData as { templateId?: string }).templateId ?? (cloneData.templateId as string | null) ?? null,
      templateSettings: data.templateSettings ?? (templateData as { templateSettings?: unknown }).templateSettings ?? cloneData.templateSettings ?? null,
      albumId: effectiveAlbumId,
    };
    for (const key of ["storyStructure", "captionOverlaySettings", "subtitleSettings", "musicMetadata", "templateSettings"] as const) {
      if (key in createData && createData[key] === null) {
        createData[key] = Prisma.JsonNull;
      }
    }

    const version = await prisma.viontoVideoVersion.create({
      data: createData as any,
      select: VERSION_SELECT,
    });

    return NextResponse.json({ data: version }, { status: 201 });
  } catch (error) {
    return serverError("versions", error);
  }
}

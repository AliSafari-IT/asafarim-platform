import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import {
  getAuthedUser,
  unauthorized,
  badRequest,
  forbidden,
  notFound,
  serverError,
} from "@/lib/server/auth";
import { updateProjectSchema, formatZodError } from "@/lib/server/validation";

export const runtime = "nodejs";

const PROJECT_SELECT = {
  id: true,
  title: true,
  description: true,
  mode: true,
  storyMode: true,
  emotionalTone: true,
  visualStyle: true,
  musicOption: true,
  musicTrackId: true,
  musicMetadata: true,
  locale: true,
  aspectRatio: true,
  resolution: true,
  targetDurationSeconds: true,
  status: true,
  userId: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { assets: true, scripts: true, exports: true, videoVersions: true } },
} as const;

/** Returns the project if the user owns it or has a share record. */
async function resolveProject(projectId: string, userId: string, email: string) {
  return prisma.viontoProject.findFirst({
    where: {
      id: projectId,
      OR: [
        { userId },
        { shares: { some: { OR: [{ sharedWithUserId: userId }, { email }] } } },
      ],
    },
    select: PROJECT_SELECT,
  });
}

/** GET /api/projects/[projectId] — owners and shared users can view */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await resolveProject(projectId, user.id, user.email);
    if (!project) return notFound();

    return NextResponse.json({ ...project, isOwner: project.userId === user.id });
  } catch (error) {
    return serverError("projects/[projectId]", error);
  }
}

/** Shared helper — only owners may mutate (PUT / PATCH) */
async function handleUpdate(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;

    // Check ownership (not just access)
    const existing = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      // Distinguish not-found vs. forbidden
      const exists = await prisma.viontoProject.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      return exists ? forbidden("Only the project owner can edit this project.") : notFound();
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const parsed = updateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const { templateId: _templateId, ...projectUpdate } = parsed.data;

    const updated = await prisma.viontoProject.update({
      where: { id: projectId },
      data: projectUpdate,
      select: PROJECT_SELECT,
    });

    return NextResponse.json({ ...updated, isOwner: true });
  } catch (error) {
    return serverError("projects/[projectId]", error);
  }
}

export async function PUT(
  req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  return handleUpdate(req, context);
}

export async function PATCH(
  req: Request,
  context: { params: Promise<{ projectId: string }> }
) {
  return handleUpdate(req, context);
}

/** DELETE /api/projects/[projectId] — owner only */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;

    const existing = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!existing) {
      const exists = await prisma.viontoProject.findUnique({
        where: { id: projectId },
        select: { id: true },
      });
      return exists ? forbidden("Only the project owner can delete this project.") : notFound();
    }

    await prisma.viontoProject.delete({ where: { id: projectId } });
    return NextResponse.json({ id: projectId, deleted: true });
  } catch (error) {
    return serverError("projects/[projectId]", error);
  }
}

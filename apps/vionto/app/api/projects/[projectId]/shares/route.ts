import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import {
  getAuthedUser,
  unauthorized,
  forbidden,
  notFound,
  badRequest,
  serverError,
} from "@/lib/server/auth";
import { addShareSchema, formatZodError } from "@/lib/server/validation";

export const runtime = "nodejs";

/** Verify the caller owns the project, return 403/404 if not. */
async function requireOwner(projectId: string, userId: string) {
  const project = await prisma.viontoProject.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  });
  if (!project) {
    const exists = await prisma.viontoProject.findUnique({
      where: { id: projectId },
      select: { id: true },
    });
    return exists ? ("forbidden" as const) : ("notfound" as const);
  }
  return "ok" as const;
}

/** GET /api/projects/[projectId]/shares — list who has access (owner only) */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const check = await requireOwner(projectId, user.id);
    if (check === "notfound") return notFound();
    if (check === "forbidden") return forbidden("Only the project owner can manage sharing.");

    const shares = await prisma.viontoProjectShare.findMany({
      where: { projectId },
      select: {
        id: true,
        email: true,
        permission: true,
        createdAt: true,
        sharedWith: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json({ data: shares });
  } catch (error) {
    return serverError("projects/[projectId]/shares", error);
  }
}

/** POST /api/projects/[projectId]/shares — add a share by email (owner only) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const check = await requireOwner(projectId, user.id);
    if (check === "notfound") return notFound();
    if (check === "forbidden") return forbidden("Only the project owner can manage sharing.");

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const parsed = addShareSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest(formatZodError(parsed.error));
    }

    const { email, permission } = parsed.data;

    // Prevent sharing with yourself
    if (email === user.email) {
      return badRequest("You cannot share a project with yourself.");
    }

    // Look up the invitee — they don't need to exist yet
    const invitee = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    // Upsert so re-inviting the same email is idempotent
    const share = await prisma.viontoProjectShare.upsert({
      where: { projectId_email: { projectId, email } },
      update: { permission, sharedWithUserId: invitee?.id ?? null },
      create: {
        projectId,
        sharedByUserId: user.id,
        sharedWithUserId: invitee?.id ?? null,
        email,
        permission,
      },
      select: {
        id: true,
        email: true,
        permission: true,
        createdAt: true,
        sharedWith: { select: { id: true, name: true, image: true } },
      },
    });

    const isRegistered = !!invitee;
    return NextResponse.json(
      { ...share, isRegistered },
      { status: 201 }
    );
  } catch (error) {
    return serverError("projects/[projectId]/shares", error);
  }
}

/** DELETE /api/projects/[projectId]/shares?shareId=… — remove a share (owner only) */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const check = await requireOwner(projectId, user.id);
    if (check === "notfound") return notFound();
    if (check === "forbidden") return forbidden("Only the project owner can manage sharing.");

    const shareId = new URL(req.url).searchParams.get("shareId");
    if (!shareId) return badRequest("shareId query parameter is required.");

    const share = await prisma.viontoProjectShare.findFirst({
      where: { id: shareId, projectId },
      select: { id: true },
    });
    if (!share) return notFound();

    await prisma.viontoProjectShare.delete({ where: { id: shareId } });
    return NextResponse.json({ id: shareId, removed: true });
  } catch (error) {
    return serverError("projects/[projectId]/shares", error);
  }
}

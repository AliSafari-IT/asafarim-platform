import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";

export const runtime = "nodejs";

async function getProject(projectId: string, userId: string) {
  return prisma.viontoProject.findFirst({
    where: { id: projectId, userId },
    select: {
      id: true,
      title: true,
      description: true,
      mode: true,
      locale: true,
      aspectRatio: true,
      resolution: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

/** GET /api/projects/[projectId]/scripts — list scripts for a project */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const project = await getProject(projectId, user.id);
    if (!project) {
      return badRequest("Project not found.");
    }

    const scripts = await prisma.viontoScript.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        projectId: true,
        userId: true,
        promptVersion: true,
        provider: true,
        model: true,
        narrationText: true,
        srtText: true,
        isUserEdited: true,
        promptTokens: true,
        completionTokens: true,
        totalTokens: true,
        latencyMs: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({ scripts });
  } catch (error) {
    return serverError("projects/[projectId]/scripts", error);
  }
}

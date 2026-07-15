import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";
import { subtitleConfigSchema } from "@/lib/server/render-manifest";

export const runtime = "nodejs";

/**
 * GET /api/projects/[projectId]/subtitles?versionId=xxx
 * Load subtitle settings from a video version (preferred) or project (fallback).
 */
export async function GET(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const versionId = searchParams.get("versionId");

    // Try loading from version first
    if (versionId) {
      const version = await prisma.viontoVideoVersion.findFirst({
        where: { id: versionId, projectId, project: { userId: user.id } },
        select: { subtitleSettings: true },
      });
      if (version) {
        const parsed = subtitleConfigSchema.safeParse(version.subtitleSettings ?? {});
        return NextResponse.json(parsed.success ? parsed.data : subtitleConfigSchema.parse({}));
      }
    }

    // Fallback to project-level settings
    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { subtitleSettings: true },
    });
    if (!project) return badRequest("Project not found.");

    const parsed = subtitleConfigSchema.safeParse(project.subtitleSettings ?? {});
    return NextResponse.json(parsed.success ? parsed.data : subtitleConfigSchema.parse({}));
  } catch (error) {
    return serverError("get subtitle settings", error);
  }
}

/**
 * PUT /api/projects/[projectId]/subtitles
 * Save subtitle settings. If body contains `versionId`, saves to the version;
 * otherwise saves to the project (backward compat).
 */
export async function PUT(req: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { projectId } = await params;
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return badRequest("Invalid JSON body.");
    }

    // Extract versionId from body before validating subtitle config
    const rawBody = body as Record<string, unknown>;
    const versionId = typeof rawBody.versionId === "string" ? rawBody.versionId : null;
    const { versionId: _vid, ...subtitleBody } = rawBody;

    const parsed = subtitleConfigSchema.safeParse(subtitleBody);
    if (!parsed.success) {
      return badRequest(`Invalid subtitle config: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
    }

    const project = await prisma.viontoProject.findFirst({
      where: { id: projectId, userId: user.id },
      select: { id: true },
    });
    if (!project) return badRequest("Project not found.");

    // Save to version if provided, and also sync to project
    if (versionId) {
      await prisma.viontoVideoVersion.updateMany({
        where: { id: versionId, projectId },
        data: { subtitleSettings: parsed.data as any },
      });
    }

    await prisma.viontoProject.update({
      where: { id: projectId },
      data: { subtitleSettings: parsed.data as any },
    });

    return NextResponse.json(parsed.data);
  } catch (error) {
    return serverError("save subtitle settings", error);
  }
}

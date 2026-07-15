import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, badRequest, serverError } from "@/lib/server/auth";

export const runtime = "nodejs";

/** PUT /api/story/[scriptId] — save user-edited narration and SRT */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { scriptId } = await params;
    let body: { narrationText?: string; srtText?: string };
    try {
      body = (await req.json()) as { narrationText?: string; srtText?: string };
    } catch {
      return badRequest("Invalid JSON body.");
    }

    const existing = await prisma.viontoScript.findFirst({
      where: { id: scriptId, userId: user.id },
      select: { id: true, projectId: true },
    });
    if (!existing) {
      return badRequest("Script not found.");
    }

    const updated = await prisma.viontoScript.update({
      where: { id: scriptId },
      data: {
        ...(typeof body.narrationText === "string" ? { narrationText: body.narrationText } : {}),
        ...(typeof body.srtText === "string" ? { srtText: body.srtText } : {}),
        isUserEdited: true,
      },
    });

    return NextResponse.json({ scriptId: updated.id, isUserEdited: updated.isUserEdited });
  } catch (error) {
    return serverError("story/[scriptId]", error);
  }
}

/** GET /api/story/[scriptId] — read a specific script */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ scriptId: string }> }
) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { scriptId } = await params;
    const script = await prisma.viontoScript.findFirst({
      where: { id: scriptId, userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!script) {
      return badRequest("Script not found.");
    }

    return NextResponse.json(script);
  } catch (error) {
    return serverError("story/[scriptId]", error);
  }
}

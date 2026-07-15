import { NextResponse } from "next/server";
import { prisma } from "@asafarim/db";
import { getAuthedUser, unauthorized, serverError } from "@/lib/server/auth";
import { createPresignedDownloadUrl } from "@/lib/server/storage";

export const runtime = "nodejs";

const MODES = new Set(["cinematic", "slideshow", "social"]);
const ASPECT_RATIOS = new Set(["16:9", "9:16", "1:1", "4:3"]);

function parseDate(value: string | null): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** GET /api/exports/library - list completed exports for the current user. */
export async function GET(req: Request) {
  try {
    const user = await getAuthedUser();
    if (!user) return unauthorized();

    const { searchParams } = new URL(req.url);
    const mode = searchParams.get("mode");
    const aspectRatio = searchParams.get("aspectRatio");
    const projectId = searchParams.get("projectId");
    const createdFrom = parseDate(searchParams.get("createdFrom"));
    const createdTo = parseDate(searchParams.get("createdTo"));
    const search = searchParams.get("search")?.trim() ?? "";
    const limit = Math.min(Math.max(Number(searchParams.get("limit") ?? 20) || 20, 1), 50);
    const cursor = searchParams.get("cursor");

    const where = {
      userId: user.id,
      ...(projectId ? { projectId } : {}),
      ...(mode && MODES.has(mode) ? { userMode: mode } : {}),
      ...(aspectRatio && ASPECT_RATIOS.has(aspectRatio) ? { aspectRatio } : {}),
      ...(createdFrom || createdTo
        ? {
            createdAt: {
              ...(createdFrom ? { gte: createdFrom } : {}),
              ...(createdTo ? { lte: createdTo } : {}),
            },
          }
        : {}),
      ...(search
        ? {
            OR: [
              { previewTitle: { contains: search, mode: "insensitive" as const } },
              { filename: { contains: search, mode: "insensitive" as const } },
              { storyKeywords: { array_contains: [search] } },
            ],
          }
        : {}),
      renderJob: { is: { state: "completed" } },
    };

    const rows = await prisma.viontoExport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        projectId: true,
        versionId: true,
        renderJobId: true,
        storageKey: true,
        filename: true,
        userMode: true,
        renderMode: true,
        aspectRatio: true,
        aspectLabel: true,
        visualStyle: true,
        storyMode: true,
        emotionalTone: true,
        storyKeywords: true,
        previewTitle: true,
        previewSubtitle: true,
        format: true,
        resolution: true,
        durationSeconds: true,
        fileSizeBytes: true,
        musicOption: true,
        musicTrackId: true,
        musicMetadata: true,
        createdAt: true,
        project: { select: { title: true, storyMode: true, emotionalTone: true } },
        version: { select: { name: true, storyMode: true, emotionalTone: true } },
      },
    });

    const page = rows.slice(0, limit);
    const data = await Promise.all(page.map(async (item) => ({
      id: item.id,
      projectId: item.projectId,
      versionId: item.versionId,
      renderJobId: item.renderJobId,
      projectTitle: item.project.title,
      versionName: item.version?.name ?? null,
      storageKey: item.storageKey,
      filename: item.filename,
      mode: item.userMode,
      storyMode: item.storyMode ?? item.version?.storyMode ?? item.project.storyMode,
      emotionalTone: item.emotionalTone ?? item.version?.emotionalTone ?? item.project.emotionalTone,
      visualStyle: item.visualStyle,
      renderMode: item.renderMode,
      aspectRatio: item.aspectRatio,
      aspectLabel: item.aspectLabel,
      keywords: Array.isArray(item.storyKeywords)
        ? item.storyKeywords.filter((keyword): keyword is string => typeof keyword === "string")
        : [],
      previewTitle: item.previewTitle,
      previewSubtitle: item.previewSubtitle,
      format: item.format,
      resolution: item.resolution,
      durationSeconds: item.durationSeconds,
      fileSizeBytes: item.fileSizeBytes,
      createdAt: item.createdAt,
      previewUrl: await createPresignedDownloadUrl(item.storageKey, 10 * 60),
    })));

    return NextResponse.json({
      data,
      nextCursor: rows.length > limit ? rows[limit].id : null,
    });
  } catch (error) {
    return serverError("exports/library", error);
  }
}

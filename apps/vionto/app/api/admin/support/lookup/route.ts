/**
 * Admin/support view for failed jobs and user project lookup
 * Requires admin role
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { userRoles: { include: { role: true } } },
    });

    const isAdmin = user?.userRoles.some((ur) => ur.role.name === "admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const userId = searchParams.get("userId");
    const failedOnly = searchParams.get("failedOnly") === "true";

    if (!email && !userId) {
      return NextResponse.json(
        { error: "email or userId query param required" },
        { status: 400 }
      );
    }

    // Find user
    const targetUser = await prisma.user.findFirst({
      where: email ? { email } : { id: userId! },
      include: {
        viontoProjects: {
          include: {
            renderJobs: failedOnly
              ? { where: { state: "failed" } }
              : true,
            exports: true,
            _count: {
              select: {
                assets: true,
                scripts: true,
                audioTracks: true,
              },
            },
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!targetUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Get failed jobs across all projects
    const failedJobs = await prisma.viontoRenderJob.findMany({
      where: {
        userId: targetUser.id,
        state: "failed",
      },
      include: {
        project: {
          select: { id: true, title: true, status: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Get usage metrics
    const usageMetrics = await prisma.viontoUsageMetric.findMany({
      where: { userId: targetUser.id },
      orderBy: { periodStart: "desc" },
      take: 30,
    });

    return NextResponse.json({
      user: {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        username: targetUser.username,
        isActive: targetUser.isActive,
        createdAt: targetUser.createdAt,
      },
      projects: targetUser.viontoProjects.map((p) => ({
        id: p.id,
        title: p.title,
        status: p.status,
        mode: p.mode,
        retentionPolicy: p.retentionPolicy,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        assetCount: p._count.assets,
        scriptCount: p._count.scripts,
        audioTrackCount: p._count.audioTracks,
        renderJobCount: p.renderJobs.length,
        exportCount: p.exports.length,
        failedJobs: p.renderJobs.filter((j) => j.state === "failed").length,
      })),
      failedJobs: failedJobs.map((j) => ({
        id: j.id,
        projectId: j.projectId,
        projectTitle: j.project.title,
        state: j.state,
        progressPercent: j.progressPercent,
        retryCount: j.retryCount,
        errorSummary: j.errorSummary,
        startedAt: j.startedAt,
        completedAt: j.completedAt,
        createdAt: j.createdAt,
      })),
      usageMetrics: usageMetrics.map((m) => ({
        metric: m.metric,
        value: m.value,
        periodStart: m.periodStart,
        periodEnd: m.periodEnd,
      })),
    });
  } catch (error) {
    console.error("Support lookup error:", error);
    return NextResponse.json(
      { error: "Support lookup failed" },
      { status: 500 }
    );
  }
}

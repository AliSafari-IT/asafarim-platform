/**
 * Retention policy enforcement API
 * Archives or deletes projects based on their retentionPolicy and age
 * Requires admin role
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check for admin role
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      include: { userRoles: { include: { role: true } } },
    });

    const isAdmin = user?.userRoles.some((ur) => ur.role.name === "admin");
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { dryRun = true, batchSize = 50 } = await req.json();

    // Find projects with soft_delete or archive retention policy older than 30 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);

    const projects = await prisma.viontoProject.findMany({
      where: {
        retentionPolicy: { in: ["soft_delete", "hard_delete", "archive"] },
        updatedAt: { lt: cutoffDate },
      },
      take: batchSize,
      include: { assets: true, exports: true },
    });

    const results = {
      total: projects.length,
      processed: 0,
      archived: 0,
      hardDeleted: 0,
      errors: [] as { projectId: string; error: string }[],
    };

    for (const project of projects) {
      try {
        if (dryRun) {
          results.processed++;
          continue;
        }

        if (project.retentionPolicy === "archive") {
          // Mark as archived (status change, no deletion)
          await prisma.viontoProject.update({
            where: { id: project.id },
            data: { status: "archived" },
          });
          results.archived++;
        } else if (project.retentionPolicy === "hard_delete") {
          // Hard delete all related records
          await prisma.viontoExport.deleteMany({ where: { projectId: project.id } });
          await prisma.viontoRenderJob.deleteMany({ where: { projectId: project.id } });
          await prisma.viontoAudioTrack.deleteMany({ where: { projectId: project.id } });
          await prisma.viontoScript.deleteMany({ where: { projectId: project.id } });
          await prisma.viontoAsset.deleteMany({ where: { projectId: project.id } });
          await prisma.viontoUsageMetric.deleteMany({ where: { projectId: project.id } });
          await prisma.viontoProject.delete({ where: { id: project.id } });
          results.hardDeleted++;
        } else {
          // soft_delete - mark status but keep data
          await prisma.viontoProject.update({
            where: { id: project.id },
            data: { status: "archived" },
          });
          results.archived++;
        }
        results.processed++;
      } catch (error) {
        results.errors.push({
          projectId: project.id,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return NextResponse.json({
      dryRun,
      cutoffDate: cutoffDate.toISOString(),
      ...results,
    });
  } catch (error) {
    console.error("Retention enforcement error:", error);
    return NextResponse.json(
      { error: "Retention enforcement failed" },
      { status: 500 }
    );
  }
}

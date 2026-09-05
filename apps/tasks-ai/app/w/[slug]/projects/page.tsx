import { requireMembership } from "../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../lib/db/client";
import { ProjectsPanel } from "../../../../components/ProjectsPanel";
import { isAtLeast } from "../../../../lib/authz";

export const dynamic = "force-dynamic";
export const metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  const db = getTasksAiDb();
  const projects = await db.project.findMany({
    where: {
      workspaceId: m.workspaceId,
      archivedAt: null,
      ...(m.role === "guest"
        ? { members: { some: { membership: { platformUserId: m.platformUserId } } } }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, name: true, description: true, visibility: true, version: true, archivedAt: true },
  });

  return (
    <ProjectsPanel
      slug={slug}
      canCreate={isAtLeast(m.role, "member")}
      initialProjects={projects.map((p) => ({ ...p, archivedAt: p.archivedAt?.toISOString() ?? null }))}
    />
  );
}

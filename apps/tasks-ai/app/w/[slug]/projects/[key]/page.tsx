import { notFound } from "next/navigation";
import { requireMembership } from "../../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../../lib/db/client";
import { TaskWorkspace } from "../../../../../components/tasks/TaskWorkspace";

export const dynamic = "force-dynamic";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string; key: string }>;
}) {
  const { slug, key } = await params;
  const m = await requireMembership(slug);
  const db = getTasksAiDb();
  const project = await db.project.findFirst({
    where: {
      workspaceId: m.workspaceId,
      key: key.toUpperCase(),
      archivedAt: null,
      ...(m.role === "guest"
        ? { members: { some: { membership: { platformUserId: m.platformUserId } } } }
        : {}),
    },
    select: { id: true, key: true, name: true },
  });
  if (!project) notFound();

  return (
    <TaskWorkspace
      slug={slug}
      me={m.membershipId}
      project={project}
      heading={`${project.key} · ${project.name}`}
    />
  );
}

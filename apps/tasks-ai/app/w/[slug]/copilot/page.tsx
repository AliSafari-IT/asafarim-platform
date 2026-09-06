import { requireMembership } from "../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../lib/db/client";
import { getAiSettings } from "../../../../lib/ai/settings";
import { CopilotPanel } from "../../../../components/ai/CopilotPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Copilot" };

export default async function CopilotPage({ params }: { params: Promise<{ slug: string }> }) {
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
    select: { id: true, key: true, name: true },
  });

  const settings = await getAiSettings({
    db,
    workspaceId: m.workspaceId,
    workspaceSlug: slug,
    actor: { membershipId: m.membershipId, platformUserId: m.platformUserId, role: m.role },
    correlationId: "page",
  });

  if (!settings.enabled) {
    return (
      <section className="ta-tw">
        <h1>Copilot</h1>
        <div className="ta-callout" role="note">
          AI is turned off for this workspace. An admin can re-enable it in AI settings. The rest of
          TasksAI works normally without it.
        </div>
      </section>
    );
  }

  return <CopilotPanel slug={slug} projects={projects} />;
}

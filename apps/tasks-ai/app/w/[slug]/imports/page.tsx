import { requireMembership } from "../../../../lib/workspace-access";
import { getTasksAiDb } from "../../../../lib/db/client";
import { ImportWizard } from "../../../../components/ImportWizard";

export const dynamic = "force-dynamic";
export const metadata = { title: "Import" };

export default async function ImportsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const m = await requireMembership(slug);
  const projects = await getTasksAiDb().project.findMany({
    where: { workspaceId: m.workspaceId, archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, key: true, name: true },
  });
  if (projects.length === 0) {
    return (
      <section className="ta-tw">
        <h1>Import tasks</h1>
        <p className="ta-muted">Create a project first — imports need somewhere to land.</p>
      </section>
    );
  }
  return <ImportWizard slug={slug} projects={projects} />;
}

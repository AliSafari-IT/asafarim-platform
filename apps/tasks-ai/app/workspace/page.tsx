import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "../../lib/session";
import { getPlatformLinks } from "@asafarim/ui";
import { listMyWorkspaces } from "../../lib/services/workspaces";
import { CreateWorkspaceForm } from "../../components/CreateWorkspaceForm";

export const metadata: Metadata = { title: "Workspaces" };
export const dynamic = "force-dynamic";

export default async function WorkspaceIndexPage() {
  const viewer = await getViewer();
  if (!viewer) {
    const links = getPlatformLinks();
    redirect(`${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/workspace`)}`);
  }

  const workspaces = await listMyWorkspaces();
  if (workspaces.length === 1) redirect(`/w/${workspaces[0].slug}`);

  return (
    <main className="ta-prose">
      <p className="ta-kicker">Workspaces</p>
      <h1>{workspaces.length ? "Choose a workspace" : "Create your workspace"}</h1>

      {workspaces.length > 0 && (
        <ul className="ta-cards">
          {workspaces.map((w) => (
            <li key={w.id}>
              <h3>
                <a href={`/w/${w.slug}`}>{w.name}</a>
              </h3>
              <p>
                /{w.slug} · {w.role}
              </p>
            </li>
          ))}
        </ul>
      )}

      <h2>{workspaces.length ? "New workspace" : "Get started"}</h2>
      <CreateWorkspaceForm />
    </main>
  );
}

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getViewer } from "../../../lib/session";
import { buildHubSignInRedirect } from "../../../lib/hub-redirect";
import { listMyWorkspaces } from "../../../lib/services/workspaces";

export const metadata: Metadata = { title: "Import from the AI Workbench", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Landing page for the AI Workbench's "Continue in TasksAI" (#678). Signs
 * the visitor in if needed, then sends them to a workspace's import wizard
 * with the handoff format selected. No content ever travels in the URL:
 * the tasks are only in the file the user uploads there.
 */
export default async function WorkbenchImportPage() {
  const viewer = await getViewer();
  if (!viewer) redirect(buildHubSignInRedirect("/import/workbench"));

  const workspaces = await listMyWorkspaces();
  if (workspaces.length === 1) redirect(`/w/${workspaces[0].slug}/imports?source=workbench`);

  return (
    <main className="ta-prose">
      <p className="ta-kicker">AI Workbench</p>
      <h1>Import an action plan</h1>
      {workspaces.length ? (
        <>
          <p>Choose the workspace to import into. You&apos;ll pick a project and see every task before anything is created.</p>
          <ul className="ta-cards">
            {workspaces.map((w) => (
              <li key={w.id}>
                <h3>
                  <a href={`/w/${w.slug}/imports?source=workbench`}>{w.name}</a>
                </h3>
                <p>/{w.slug}</p>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p>
          You don&apos;t have a workspace yet. <a href="/workspace">Create one</a>, then come back to this page to import your plan.
        </p>
      )}
    </main>
  );
}

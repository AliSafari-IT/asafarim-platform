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
import { getPlatformLinks } from "@asafarim/ui";
import { getViewer } from "../../lib/session";

export const metadata: Metadata = {
  title: "Workspace",
};

/**
 * The authenticated shell. The proxy already redirects anonymous users to
 * Hub; this second check is the data-boundary belt-and-braces (a JWT stays
 * valid until expiry, so a deactivated account must lose access here too).
 * The real workspace — projects, views, tasks — arrives in M02/M03.
 */
export default async function WorkspacePage() {
  const viewer = await getViewer();
  if (!viewer) {
    const links = getPlatformLinks();
    redirect(
      `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/workspace`)}`,
    );
  }

  return (
    <main className="ta-prose">
      <p className="ta-kicker">Workspace</p>
      <h1>You&apos;re signed in</h1>
      <p className="ta-lead">
        Single sign-on works. Your workspace, projects, and views are not built yet — they land
        in M02 (work graph + API) and M03 (task experience).
      </p>

      <div className="ta-callout" role="note">
        <strong>M01 — Platform foundation.</strong> What is real today: the app shell, isolated
        database with migrations, health endpoints, the background worker skeleton, and CI.
      </div>

      <dl className="ta-facts">
        <div>
          <dt>Identity stored</dt>
          <dd>An opaque platform user id only. No email or name is copied here.</dd>
        </div>
        <div>
          <dt>Database</dt>
          <dd>Dedicated PostgreSQL, isolated from the platform schema.</dd>
        </div>
        <div>
          <dt>Health</dt>
          <dd>
            <a href="/api/health">/api/health</a>
          </dd>
        </div>
      </dl>
    </main>
  );
}

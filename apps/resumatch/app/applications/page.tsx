import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { listApplications } from "../../lib/applications/service";
import { getCurrentWorkspace } from "../../lib/workspace";
import { ApplicationRow } from "./ApplicationRow";

export const metadata: Metadata = { title: "Applications" };
export const dynamic = "force-dynamic";

/** List view for issue #432's per-application tracker. Read-only server
 *  render; status/notes edits happen inline via ApplicationRow's client
 *  PATCH calls to /api/applications/[id]. */
export default async function ApplicationsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="Applications" title="This account cannot open a workspace." />
        <Alert tone="warning">
          <strong>Account inactive.</strong> Your platform account is not active, so ResuMatch will
          not open a workspace for it.
        </Alert>
      </>
    );
  }

  const applications = await listApplications(workspace.id);

  return (
    <>
      <PageHeader
        kicker="Applications"
        title="Your applications"
        description="Every job you've saved or applied to, in one list — with the tailored resume you used for it, if any."
      />

      {applications.length === 0 ? (
        <Alert tone="info">
          Nothing tracked yet. After tailoring a CV toward a job, you can save it here to follow up
          on later.
        </Alert>
      ) : (
        <div className="rm-application-list">
          {applications.map((application) => (
            <ApplicationRow key={application.id} application={application} />
          ))}
        </div>
      )}
    </>
  );
}

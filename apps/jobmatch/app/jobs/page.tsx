import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { getCurrentWorkspace } from "../../lib/workspace";
import { JobsSearch } from "./JobsSearch";

export const metadata: Metadata = { title: "Jobs" };
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="Jobs" title="This account cannot search yet." />
        <Alert tone="warning">
          <strong>Account inactive.</strong> Your platform account is not active, so JobMatch will
          not open a workspace for it.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Jobs"
        kickerIndex="M4"
        title="Search, with the reasons attached."
        description="Every hard exclusion is shown, not hidden — so a job you don't fit still tells you why, unless you asked never to see that employer at all."
      />
      <div style={{ marginTop: "1.5rem" }}>
        <JobsSearch />
      </div>
    </>
  );
}

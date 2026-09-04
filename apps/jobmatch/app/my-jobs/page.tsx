import type { Metadata } from "next";
import { Alert, PageHeader } from "@asafarim/ui";
import { getCurrentWorkspace } from "../../lib/workspace";
import { MyJobsTracker } from "./MyJobsTracker";

export const metadata: Metadata = { title: "My Jobs" };
export const dynamic = "force-dynamic";

export default async function MyJobsPage() {
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="My Jobs" title="This account has nothing to track yet." />
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
        kicker="My Jobs"
        kickerIndex="M6"
        title="Your own record of the search, not a feed's."
        description="Save what you want to keep an eye on, mark what you've applied to, and export the whole list as a CSV that opens the same way every time."
      />
      <div style={{ marginTop: "1.5rem" }}>
        <MyJobsTracker />
      </div>
    </>
  );
}

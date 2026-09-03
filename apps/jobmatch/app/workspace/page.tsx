import type { Metadata } from "next";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { getCurrentWorkspace } from "../../lib/workspace";

export const metadata: Metadata = { title: "Workspace" };

// The workspace reads the session and touches the database on every visit.
export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const workspace = await getCurrentWorkspace();

  // The proxy already redirects anonymous visitors to Hub; reaching this
  // branch means a valid JWT for an account that is no longer active.
  if (!workspace) {
    return (
      <>
        <PageHeader kicker="Workspace" title="This account cannot open a workspace." />
        <Alert tone="warning">
          <strong>Account inactive.</strong>{" "}
          Your platform account is not active, so JobMatch will not create or open a workspace for
          it. Contact the platform administrator if this is unexpected.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Workspace"
        kickerIndex="M1"
        title="Your JobMatch workspace exists."
        description="An isolated, per-user container in JobMatch's own database. Everything later milestones add — your profile, saved jobs, match evaluations — hangs off this one row."
      />

      <section className="jm-grid" style={{ margin: "2rem 0" }}>
        <Card title="Workspace">
          <p className="jm-mono" style={{ fontSize: "0.8rem", opacity: 0.7 }}>
            {workspace.id}
          </p>
          <p style={{ opacity: 0.85 }}>
            Created {workspace.createdAt.toISOString().slice(0, 10)}. Keyed to your platform
            account by an opaque id — your name and email stay in the platform database.
          </p>
        </Card>
        <Card title="Next: your profile">
          <p style={{ opacity: 0.85 }}>
            CV upload, extraction, and the correction step arrive in M2, behind malware scanning and
            private storage. Until then there is nothing here to fill in.
          </p>
        </Card>
        <Card title="Next: job sources">
          <p style={{ opacity: 0.85 }}>
            The first connector arrives in M3, and only once a source agreement is recorded in the
            source-rights register.
          </p>
        </Card>
      </section>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
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
          Your platform account is not active, so ResuMatch will not create or open a workspace for
          it. Contact the platform administrator if this is unexpected.
        </Alert>
      </>
    );
  }

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Your ResuMatch workspace exists."
        description="An isolated, per-user container in ResuMatch's own database. Your profile and every tailored CV you generate hang off this one row."
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
        <Card title="Your profile">
          <p style={{ opacity: 0.85 }}>
            Upload a CV, correct what was read from it, and confirm it. Tailoring always reads from
            your confirmed version.
          </p>
          <Link href="/profile" className="ui-btn ui-btn--secondary ui-btn--sm">
            Go to your profile →
          </Link>
        </Card>
        <Card title="Tailor a CV">
          <p style={{ opacity: 0.85 }}>
            Paste a job posting URL and let AI reword your confirmed profile toward it, then
            download it as a PDF.
          </p>
          <Link href="/tailor" className="ui-btn ui-btn--primary ui-btn--sm">
            Tailor your CV →
          </Link>
        </Card>
      </section>
    </>
  );
}

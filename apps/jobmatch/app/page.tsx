import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Overview" };

const FOUNDATION = [
  {
    title: "Isolated database",
    body: "JobMatch runs on its own PostgreSQL instance with its own credentials. It stores an opaque platform user id and never copies the platform user table.",
  },
  {
    title: "Shared sign-in",
    body: "Authentication is the platform's: Hub issues the session, JobMatch only reads it. There is no second password to manage or leak.",
  },
  {
    title: "Redacted observability",
    body: "Every log line and audit row passes through an allow-list. CV text and connector credentials cannot reach a log sink by accident.",
  },
  {
    title: "Deny-by-default routing",
    body: "Only the landing and legal pages are public. Every other surface requires a session, checked again at the data boundary.",
  },
];

export default function JobMatchOverviewPage() {
  return (
    <>
      <PageHeader
        kicker="Foundation milestone"
        kickerIndex="M1"
        title="JobMatch is not another job board."
        description="It is a personal, explainable job-search assistant that reduces hundreds of vacancies to the opportunities worth acting on. This is the platform foundation it will be built on."
      />

      <Alert tone="info">
        <strong>Nothing to match against yet.</strong>{" "}
        No job source is connected and no CV can be uploaded. Source access is gated on signed
        agreements (M0/M3) and CV handling on the privacy work in M2 — neither is something to
        prototype first and legalize later.
      </Alert>

      <section className="jm-grid" style={{ margin: "2rem 0" }}>
        {FOUNDATION.map((item) => (
          <Card key={item.title} title={item.title}>
            <p style={{ opacity: 0.85 }}>{item.body}</p>
          </Card>
        ))}
      </section>

      <p className="jm-note">
        Signed in?{" "}
        <Link href="/workspace" className="jm-mono">
          Open your workspace →
        </Link>
      </p>
    </>
  );
}

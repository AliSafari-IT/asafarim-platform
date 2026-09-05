import type { Metadata } from "next";
import Link from "next/link";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { ShowcaseNotice } from "./components/ShowcaseNotice";

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
  {
    title: "Your CV, scanned before it is read",
    body: "Nothing opens an uploaded file until a malware scanner clears it. If the scanner cannot answer, the file is quarantined rather than processed.",
  },
  {
    title: "No age, nationality, or gender",
    body: "There is no field for them, so nothing can store or infer them from your CV — and the profile you match with is the one you confirmed, not the one a parser guessed.",
  },
  {
    title: "Delete it whenever you like",
    body: "One click removes your file, every profile version, and everything read from them. Originals are deleted automatically after 90 days regardless.",
  },
];

export default function JobMatchOverviewPage() {
  return (
    <>
      <PageHeader
        kicker="Building in the open"
        kickerIndex="M2"
        title="JobMatch is not another job board."
        description="It is a personal, explainable job-search assistant that reduces hundreds of vacancies to the opportunities worth acting on. You can build your profile today; the job sources come next."
      />

      <ShowcaseNotice />

      <Alert tone="info">
        <strong>No live job source is connected.</strong>{" "}
        Access to a real source is gated on signed agreements rather than on engineering — not
        something to prototype first and legalize later. To walk through the full candidate journey,
        the showcase can load a clearly-labelled <strong>synthetic demo source</strong> whose
        postings are fabricated and are never presented as real vacancies.
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
        <Link href="/profile" className="jm-mono">
          Build your profile →
        </Link>
      </p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { Card, PageHeader } from "@asafarim/ui";
import { ShowcaseNotice } from "./components/ShowcaseNotice";

export const metadata: Metadata = { title: "Overview" };

const FOUNDATION = [
  {
    title: "Isolated database",
    body: "ResuMatch runs on its own PostgreSQL instance with its own credentials. It stores an opaque platform user id and never copies the platform user table.",
  },
  {
    title: "Shared sign-in",
    body: "Authentication is the platform's: Hub issues the session, ResuMatch only reads it. There is no second password to manage or leak.",
  },
  {
    title: "Redacted observability",
    body: "Every log line and audit row passes through an allow-list. CV text and job-page content cannot reach a log sink by accident.",
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
    body: "There is no field for them, so nothing can store or infer them from your CV — and the profile tailoring reads from is the one you confirmed, not the one a parser guessed.",
  },
  {
    title: "Never a fabricated fact",
    body: "AI rewords and reprioritizes your summary, headline, and experience bullets — it never invents an employer, a date, a degree, or a skill you did not already list.",
  },
  {
    title: "Delete it whenever you like",
    body: "One click removes your file, every profile version, every job page you fetched, and every tailored CV. Originals are deleted automatically after 90 days regardless.",
  },
];

export default function ResuMatchOverviewPage() {
  return (
    <>
      <section className="jm-hero">
        <PageHeader
          kicker="Building in the open"
          title="Tailor your CV to one job, honestly."
          description="Paste the URL of a job you want to apply to. ResuMatch reads it, rewrites your confirmed profile toward it with AI, and gives you a downloadable PDF — without ever inventing a fact about you."
        />
      </section>

      <ShowcaseNotice />

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

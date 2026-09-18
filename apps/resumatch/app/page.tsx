import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@asafarim/ui";
import { ShowcaseNotice } from "./components/ShowcaseNotice";
import {
  ArrowRightIcon,
  DownloadIcon,
  EyeOffIcon,
  KeyIcon,
  LinkIcon,
  LockIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SparkIcon,
  TrashIcon,
  UploadIcon,
  UserIcon,
} from "./profile/icons";

export const metadata: Metadata = { title: "Overview" };

const STEPS = [
  {
    icon: <UploadIcon />,
    title: "Upload your CV",
    body: "It's scanned for malware, then read into a profile you can correct before anything else touches it.",
  },
  {
    icon: <LinkIcon />,
    title: "Paste a job URL",
    body: "One job, the one you actually want. ResuMatch fetches it directly — no job-board licensing, no scraping at scale.",
  },
  {
    icon: <DownloadIcon />,
    title: "Download the tailored PDF",
    body: "AI rewords and reprioritizes your confirmed profile toward that job, then hands you a print-ready CV.",
  },
];

const FOUNDATION = [
  {
    icon: <LockIcon />,
    title: "Isolated database",
    body: "ResuMatch runs on its own PostgreSQL instance with its own credentials. It stores an opaque platform user id and never copies the platform user table.",
  },
  {
    icon: <KeyIcon />,
    title: "Shared sign-in",
    body: "Authentication is the platform's: Hub issues the session, ResuMatch only reads it. There is no second password to manage or leak.",
  },
  {
    icon: <EyeOffIcon />,
    title: "Redacted observability",
    body: "Every log line and audit row passes through an allow-list. CV text and job-page content cannot reach a log sink by accident.",
  },
  {
    icon: <ShieldCheckIcon />,
    title: "Deny-by-default routing",
    body: "Only the landing and legal pages are public. Every other surface requires a session, checked again at the data boundary.",
  },
  {
    icon: <ShieldAlertIcon />,
    title: "Your CV, scanned before it is read",
    body: "Nothing opens an uploaded file until a malware scanner clears it. If the scanner cannot answer, the file is quarantined rather than processed.",
  },
  {
    icon: <UserIcon />,
    title: "No age, nationality, or gender",
    body: "There is no field for them, so nothing can store or infer them from your CV — and the profile tailoring reads from is the one you confirmed, not the one a parser guessed.",
  },
  {
    icon: <SparkIcon />,
    title: "Never a fabricated fact",
    body: "AI rewords and reprioritizes your summary, headline, and experience bullets — it never invents an employer, a date, a degree, or a skill you did not already list.",
  },
  {
    icon: <TrashIcon />,
    title: "Delete it whenever you like",
    body: "One click removes your file, every profile version, every job page you fetched, and every tailored CV. Originals are deleted automatically after 90 days regardless.",
  },
];

const TINTS = ["99, 102, 241", "16, 185, 129", "245, 158, 11", "139, 92, 246", "236, 72, 153", "14, 165, 233"];

export default function ResuMatchOverviewPage() {
  return (
    <>
      <section className="jm-hero">
        <PageHeader
          kicker="Building in the open"
          title="Tailor your CV to one job, honestly."
          description="Paste the URL of a job you want to apply to. ResuMatch reads it, rewrites your confirmed profile toward it with AI, and gives you a downloadable PDF — without ever inventing a fact about you."
        />

        <div className="jm-hero-ctas">
          <Link href="/profile" className="jm-hero-cta jm-hero-cta--primary">
            Build your profile <ArrowRightIcon />
          </Link>
          <a href="#how-it-works" className="jm-hero-cta jm-hero-cta--secondary">
            See how it works
          </a>
        </div>

        <div className="jm-hero-stats">
          <div className="jm-hero-stat">
            <strong>0</strong>
            <span>fabricated facts, ever</span>
          </div>
          <div className="jm-hero-stat">
            <strong>1</strong>
            <span>job at a time, on purpose</span>
          </div>
          <div className="jm-hero-stat">
            <strong>90 days</strong>
            <span>automatic deletion</span>
          </div>
        </div>
      </section>

      <ShowcaseNotice />

      <section id="how-it-works" style={{ marginTop: "2rem" }}>
        <h2 style={{ marginBottom: "0.25rem" }}>How it works</h2>
        <p style={{ opacity: 0.75, margin: 0 }}>Three steps, nothing hidden in between.</p>
        <div className="jm-steps">
          {STEPS.map((step, index) => (
            <div className="jm-step" key={step.title}>
              <span
                className="jm-step__number"
                style={{ ["--category-tint" as string]: TINTS[index % TINTS.length] }}
              >
                {index + 1}
              </span>
              <p className="jm-step__title">{step.title}</p>
              <p className="jm-step__body">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ marginBottom: "0.25rem" }}>Built to be trusted with your CV</h2>
        <p style={{ opacity: 0.75, margin: 0 }}>The guarantees behind every upload and every tailored CV.</p>
        <div className="jm-feature-grid">
          {FOUNDATION.map((item, index) => (
            <div
              className="jm-feature-card"
              key={item.title}
              style={{ ["--category-tint" as string]: TINTS[index % TINTS.length] }}
            >
              <span className="jm-feature-card__icon">{item.icon}</span>
              <p className="jm-feature-card__title">{item.title}</p>
              <p className="jm-feature-card__body">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="jm-final-cta">
        <div className="jm-final-cta__text">
          <strong>Ready to tailor your first CV?</strong>
          <span>Sign in with your platform account — no separate password to create.</span>
        </div>
        <Link href="/profile" className="jm-hero-cta jm-hero-cta--primary">
          Build your profile <ArrowRightIcon />
        </Link>
      </div>
    </>
  );
}

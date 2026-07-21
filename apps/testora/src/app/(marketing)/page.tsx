import type { Metadata } from "next";
import Link from "next/link";
import {
  ListChecks,
  Boxes,
  FlaskConical,
  PlayCircle,
  FileBarChart,
  Bug,
  ArrowRight,
  Database,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Testora — Define, run and track E2E tests",
  description:
    "Testora is an end-to-end test automation platform: capture functional requirements, organize suites, fixtures and cases, run them with TestCafe, and keep every result in PostgreSQL.",
};

const features = [
  {
    icon: ListChecks,
    title: "Functional requirements",
    body: "Capture what each app must do as living requirements, then trace them straight into the tests that prove them.",
  },
  {
    icon: Boxes,
    title: "Suites & fixtures",
    body: "Group behaviour into suites and reusable fixtures so coverage stays organized as an app grows.",
  },
  {
    icon: FlaskConical,
    title: "Test cases",
    body: "Author concrete cases from your fixtures — no brittle scripts scattered across repos.",
  },
  {
    icon: PlayCircle,
    title: "Run with TestCafe",
    body: "Drive a real headless browser against local or remote targets and watch progress stream live.",
  },
  {
    icon: FileBarChart,
    title: "Results & reports",
    body: "Every run is stored with pass/fail status and failure screenshots you can review at a glance.",
  },
  {
    icon: Bug,
    title: "Issue drafting",
    body: "Turn a failing result into a ready-to-file issue — optionally AI-drafted and published to GitHub.",
  },
];

const steps = [
  {
    n: "01",
    title: "Describe the app",
    body: "Register the app under test and its functional requirements.",
  },
  {
    n: "02",
    title: "Build coverage",
    body: "Compose suites, fixtures and cases that map to those requirements.",
  },
  {
    n: "03",
    title: "Run & triage",
    body: "Execute against your target, review results, and file issues for failures.",
  },
];

export default function HomePage() {
  return (
    <main>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10 opacity-70"
          style={{
            background:
              "radial-gradient(60rem 30rem at 50% -10%, hsl(var(--primary) / 0.18), transparent 60%), radial-gradient(40rem 24rem at 90% 10%, hsl(var(--accent) / 0.14), transparent 60%)",
          }}
        />
        <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-28">
          <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
            <Logo className="h-16 w-16" />
            <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              End-to-end testing, organized
            </span>
            <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-6xl">
              Define, run and track your{" "}
              <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                E2E tests
              </span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
              Testora turns functional requirements into runnable TestCafe suites, executes them
              against local or remote targets, and keeps every result — screenshots included — in
              PostgreSQL.
            </p>
            <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/dashboard">
                  Open the app
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/about">Read the guide</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Everything a test workflow needs
          </h2>
          <p className="mt-3 text-muted-foreground">
            From the first requirement to the filed bug report — in one place.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
            >
              <div className="inline-flex rounded-lg bg-primary/15 p-2.5 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="border-y border-border bg-card/40">
        <div className="mx-auto w-full max-w-6xl px-6 py-16">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">How it works</h2>
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {steps.map(({ n, title, body }) => (
              <div key={n} className="relative">
                <div className="text-4xl font-bold text-primary/30">{n}</div>
                <h3 className="mt-2 text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <Database className="h-4 w-4 text-accent" />
              PostgreSQL-backed
            </span>
            <span className="inline-flex items-center gap-2">
              <PlayCircle className="h-4 w-4 text-accent" />
              TestCafe runner
            </span>
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Private apps stay key-locked
            </span>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-10 text-center sm:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-80"
            style={{
              background:
                "radial-gradient(40rem 20rem at 50% 120%, hsl(var(--primary) / 0.16), transparent 60%)",
            }}
          />
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Ready to run your first suite?
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Jump into the dashboard to browse requirements, fixtures and results — or read the guide
            to see how a run comes together.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open the app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/about">About &amp; Guide</Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

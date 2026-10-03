import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BellRing,
  Bug,
  Camera,
  MonitorPlay,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";
import { getShowcaseProject } from "@asafarim/auth/apps";
import { ShowcaseNotice } from "@asafarim/ui";
import { Button } from "@/components/ui/button";
import { LiveTestBoard } from "@/components/marketing/live-test-board";
import { PROJECTS } from "@/data/projects";

const showcase = getShowcaseProject("testora")!;

/** The apps Testora covers, read from the catalog so the copy can't drift (#751). */
const coveredApps = PROJECTS.map((p) => p.name.replace(/^ASafar[iI]M\s*·\s*/, ""));
const coveredAppsText = new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(coveredApps);

export const metadata: Metadata = {
  title: "Testora — ASafarIM apps, tested like a real user",
  description:
    "Testora runs end-to-end tests against ASafarIM apps the way a real user would. Sign in with your ASafarIM account to see the latest results; testers run tests and report a failure to our GitHub repo in one click — or learn we already know about it.",
};

const steps = [
  {
    title: "Run like a user",
    body: "Real headless-browser suites exercise ASafarIM apps end to end.",
  },
  {
    title: "Watch the results",
    body: "Anyone with an ASafarIM account sees the latest pass/fail per app, with evidence.",
  },
  {
    title: "Testers report in one click",
    body: "A tester turns a failure into a GitHub issue — or learns it’s already tracked.",
  },
];

const features = [
  {
    icon: Activity,
    title: "Live results per app",
    body: "The latest end-to-end run for each ASafarIM product, pass/fail at a glance.",
  },
  {
    icon: Bug,
    title: "One-click bug reports",
    body: "Testers turn a failing test into an issue on the platform repo without leaving the page.",
  },
  {
    icon: BellRing,
    title: "Duplicate-aware",
    body: "Before filing, Testora checks open issues — if it’s known, you’re told we’re on it.",
  },
  {
    icon: Wand2,
    title: "AI-drafted issues",
    body: "Steps, expected vs. actual and context are drafted for you from the failed run.",
  },
  {
    icon: MonitorPlay,
    title: "Real browser runs",
    body: "TestCafe drives a real headless browser — clicks, forms and navigation, like a person.",
  },
  {
    icon: Camera,
    title: "Evidence attached",
    body: "Failure screenshots and run details travel with every report.",
  },
];

export default function HomePage() {
  return (
    <main className="relative isolate">
      {/* Backdrop: aurora + masked grid, matching the platform's AI look. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[1000px] overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(52rem 34rem at 10% -8%, hsl(var(--primary) / 0.28), transparent 62%), radial-gradient(44rem 30rem at 95% 8%, hsl(var(--ts-accent) / 0.18), transparent 60%), radial-gradient(40rem 26rem at 50% 105%, hsl(var(--destructive) / 0.08), transparent 60%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--foreground) / 0.04) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--foreground) / 0.04) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, #000 30%, transparent 75%)",
          }}
        />
      </div>

      {/* Hero */}
      <section className="mx-auto grid min-h-[calc(100svh-4.5rem)] w-full max-w-6xl items-center gap-12 px-6 py-10 lg:grid-cols-[1fr_1.05fr] lg:gap-16">
        <div className="min-w-0">
          <span className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card/70 py-1 pl-1.5 pr-3.5 font-mono text-[0.7rem] uppercase tracking-wider text-muted-foreground backdrop-blur">
            <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-primary to-accent px-2 py-0.5 font-bold text-white">
              <Sparkles className="h-3 w-3" /> AI
            </span>
            E2E for the ASafarIM platform
          </span>

          <h1 className="mt-6 text-4xl font-extrabold leading-[1.04] tracking-tight sm:text-5xl lg:text-6xl">
            ASafarIM apps, tested{" "}
            <span className="bg-gradient-to-r from-primary via-accent to-primary bg-[length:200%_auto] bg-clip-text text-transparent motion-safe:animate-[sheen_8s_linear_infinite]">
              like a real user.
            </span>
          </h1>

          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Testora runs end-to-end tests against {coveredAppsText}. Sign in with your ASafarIM
            account to see the latest results per app. Testers run the tests and, when something
            breaks, report it to our repo in one click.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open the app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how">How reporting works</Link>
            </Button>
          </div>

          <ol className="mt-10 grid gap-5 border-t border-border pt-6 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="min-w-0">
                <span className="grid h-7 w-7 place-items-center rounded-lg bg-gradient-to-br from-primary to-accent font-mono text-[0.68rem] font-bold text-white">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="mt-2 text-sm font-semibold">{step.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>

        <LiveTestBoard />
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-16">
        <div className="max-w-2xl">
          <p className="font-mono text-xs uppercase tracking-widest text-primary">What you get</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            From a failing test to a fix, without the busywork
          </h2>
        </div>
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="group rounded-2xl border border-border bg-card/70 p-6 backdrop-blur transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-[0_20px_50px_-24px_hsl(var(--primary)/0.5)]"
            >
              <div className="inline-flex rounded-xl bg-gradient-to-br from-primary to-accent p-2.5 text-white">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-base font-semibold">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How reporting works */}
      <section id="how" className="scroll-mt-20 border-y border-border bg-card/40">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-6 py-16 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="font-mono text-xs uppercase tracking-widest text-primary">How reporting works</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              One report per bug — never a pile of duplicates
            </h2>
            <p className="mt-3 text-muted-foreground">
              Every report goes to the platform repo on GitHub. Testora looks for a matching open issue
              first, so you either start the fix or join one that is already moving.
            </p>
            <p className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Results are behind platform sign-in; running tests and reporting need the Tester role (or admin).
            </p>
          </div>
          <ol className="grid gap-3">
            {[
              ["A test fails", "The run records the failing step, expected vs. actual, and a screenshot."],
              ["A tester clicks “Report bug”", "Signed in with an ASafarIM account that has the Tester role (or admin) — no GitHub account needed."],
              ["Testora checks open issues", "The failure is matched against issues already open on the repo."],
              ["Filed — or already tracked", "No match: a new issue is filed with the evidence. Match: you’re told we know and are on it."],
            ].map(([title, body], i) => (
              <li key={title} className="flex gap-4 rounded-2xl border border-border bg-card/70 p-4 backdrop-blur">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-primary/40 font-mono text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA + honest positioning */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card/70 p-10 text-center backdrop-blur sm:p-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10"
            style={{
              background:
                "radial-gradient(40rem 20rem at 50% 120%, hsl(var(--primary) / 0.22), transparent 60%)",
            }}
          />
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Help us keep ASafarIM apps working
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            Sign in with your ASafarIM account to follow the results. Want to run tests or report
            bugs? Ask an admin for the Tester role.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/dashboard">
                Open the app
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/about-this-project">About &amp; Guide</Link>
            </Button>
          </div>
        </div>
        <ShowcaseNotice
          content={showcase}
          className="mx-auto mt-10 max-w-3xl text-left"
          renderLink={({ href, children }) => <Link href={href}>{children}</Link>}
        />
      </section>
    </main>
  );
}

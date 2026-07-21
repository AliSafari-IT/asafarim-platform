import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";
import {
  ListChecks,
  Boxes,
  FlaskConical,
  TestTube2,
  PlayCircle,
  FileBarChart,
  ArrowRight,
  Globe2,
  Terminal,
  Layers,
  Zap,
  ShieldCheck,
  Repeat,
  Workflow,
  Lightbulb,
  AlertTriangle,
  Rocket,
  Code2,
} from "lucide-react";

export const metadata: Metadata = {
  title: "About & Guide · e2e-testora",
  description:
    "What testora is, the mental model behind it, and a complete hands-on guide to building end-to-end coverage for any app — illustrated with the app under test.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-14 pb-16">
      <Hero />
      <BigIdea />
      <MentalModel />
      <Anatomy />
      <ThreeFlavors />
      <Environments />
      <WorkedExample />
      <RunningTests />
      <ReadingResults />
      <Recipes />
      <BringYourOwnApp />
      <CheatSheet />
      <FooterCta />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <header className="relative overflow-hidden rounded-2xl border border-border bg-card p-8 sm:p-12">
      {/* brand wash */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/25 via-accent/10 to-transparent" />
      <div className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
      <div className="relative flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <Logo className="h-12 w-12" />
          <div>
            <div className="text-xl font-semibold tracking-tight">e2e-testora</div>
            <div className="text-sm text-muted-foreground">end-to-end, verified</div>
          </div>
        </div>
        <h1 className="max-w-2xl text-3xl font-semibold leading-tight sm:text-4xl">
          Describe how your app should behave. Run it for real. Watch it pass.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          testora is a database-backed control room for end-to-end tests. You model what your
          product must do as structured data — requirements, suites, fixtures, cases — and testora
          turns it into live TestCafe browser runs, streams the console as it goes, and stores every
          result. It works for <span className="text-foreground">any web app</span>; throughout this
          guide we drive the real <span className="text-foreground">the app under test</span> app and its
          local dev environment as the worked example.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/run">
              <PlayCircle className="h-4 w-4" />
              Run something now
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/requirements">
              Browse requirements
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

function BigIdea() {
  const ideas = [
    {
      icon: Layers,
      title: "Tests as data, not scattered files",
      body: "Every requirement, suite, fixture and case lives in PostgreSQL. The catalog is queryable, diffable and shareable — not buried in a folder of spec files nobody reads.",
    },
    {
      icon: Globe2,
      title: "Real browsers, real endpoints",
      body: "Under the hood it's TestCafe. Cases either drive a real Chrome session (clicks, typing, assertions) or hit your API directly with t.request — whichever proves the behaviour fastest.",
    },
    {
      icon: Terminal,
      title: "One control room",
      body: "Pick what to run, watch the live console stream, cancel mid-flight, and read color-coded results — all from the same place, on any machine that can reach the app under test.",
    },
  ];
  return (
    <Section
      kicker="The big idea"
      title="A catalog of behaviour you can actually run"
      lead="testora sits between “a wiki of test cases” and “a folder of automation scripts” — and gives you the best of both."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {ideas.map((idea) => (
          <Card key={idea.title} className="bg-card/60">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="w-fit rounded-md bg-primary/15 p-2 text-primary">
                <idea.icon className="h-5 w-5" />
              </div>
              <div className="font-medium">{idea.title}</div>
              <p className="text-sm text-muted-foreground">{idea.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function MentalModel() {
  const levels = [
    {
      icon: ListChecks,
      tone: "primary" as const,
      name: "Functional Requirement",
      one: "What the product must do",
      detail: "A capability of the app and the environment it lives in.",
      immo: "Authentication · Registration · Listing-site scraping · Video generation",
    },
    {
      icon: Boxes,
      tone: "accent" as const,
      name: "Suite",
      one: "A coherent slice of that capability",
      detail: "Groups fixtures that belong together under one requirement.",
      immo: "“Login Flow” · “Register Flow” · “Supported listing sites”",
    },
    {
      icon: FlaskConical,
      tone: "success" as const,
      name: "Fixture",
      one: "One target, one setup",
      detail: "A page or endpoint to exercise, with a baseUrl and shared input.",
      immo: "“Login using email/password” → /en/login",
    },
    {
      icon: TestTube2,
      tone: "muted" as const,
      name: "Test Case",
      one: "A single behaviour to prove",
      detail: "The assertion. Can repeat across many parameterised runs.",
      immo: "“Login fails with invalid password” (×2 runs)",
    },
  ];
  return (
    <Section
      kicker="The mental model"
      title="Four nested layers, top to bottom"
      lead="Everything in testora hangs off this hierarchy. Internalise it once and the whole app makes sense. A run can target any level — the layers below it all execute."
    >
      <div className="flex flex-col gap-3">
        {levels.map((lvl, i) => (
          <div key={lvl.name} className="flex items-stretch gap-3">
            <div className="flex flex-col items-center">
              <div className={cn("rounded-lg p-2.5", toneBg(lvl.tone))}>
                <lvl.icon className="h-5 w-5" />
              </div>
              {i < levels.length - 1 && <div className="my-1 w-px flex-1 bg-border" />}
            </div>
            <Card className="flex-1 bg-card/60">
              <CardContent className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{lvl.name}</span>
                    <Badge variant="outline" className="font-normal">
                      {lvl.one}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{lvl.detail}</p>
                </div>
                <code className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
                  {lvl.immo}
                </code>
              </CardContent>
            </Card>
          </div>
        ))}
      </div>
      <Tip icon={Lightbulb}>
        A <span className="text-foreground">Run</span> executes a fixture and produces a{" "}
        <span className="text-foreground">Result</span> per case (per run). Point it at a single
        fixture, a whole suite, or an entire requirement and testora walks every fixture beneath it
        in turn.
      </Tip>
    </Section>
  );
}

function Anatomy() {
  return (
    <Section
      kicker="Anatomy"
      title="What a slice of the catalog looks like"
      lead="Here is an example login capability expressed as testora data. Notice how the fixture’s relative baseUrl is resolved against the requirement’s environment root."
    >
      <CodeBlock label="the catalog, as data">{`// Functional Requirement — the capability + its environment
const authenticationFR = {
  id: "auth",
  title: "Authentication",
  baseUrl: "http://localhost:3233",   // app dev frontend
};

// Suite — a coherent group under that requirement
const loginFlowSuite = {
  suiteId: "login-flow", frId: "auth", title: "Login Flow",
};

// Fixture — one target page + shared setup
const loginWithEmailFixture = {
  fixtureId: "login-with-email",
  suiteId: "login-flow",
  title: "Login using email/password",
  baseUrl: "/en/login",   // inherits → http://localhost:3233/en/login
  commonInput: {},
};

// Test Case — the behaviour, repeated across parameterised runs
const invalidPassword = {
  caseId: "invalid-password",
  fixtureId: "login-with-email",
  title: "Login fails with invalid password",
  scriptType: "scripted",
  runs: [
    { email: ACCOUNT_EMAIL, password: "wrong",     expectAuth: false },
    { email: ACCOUNT_EMAIL, password: "incorrect", expectAuth: false },
  ],
  script: LOGIN_ATTEMPT_SCRIPT,   // a TestCafe body, see below
};`}</CodeBlock>
    </Section>
  );
}

function ThreeFlavors() {
  const flavors = [
    {
      type: "single",
      icon: TestTube2,
      tone: "accent" as const,
      tagline: "Fill fields, submit, assert.",
      body: "The declarative path. Describe inputs and an expected outcome; testora’s generator builds the TestCafe spec for you. Best for plain forms with one straightforward result.",
    },
    {
      type: "multi",
      icon: Repeat,
      tone: "primary" as const,
      tagline: "The same case, many inputs.",
      body: "One assertion, a runs[] array of parameter sets. testora executes it once per entry and reports each as “(run 1…N)”. Perfect for validation matrices and data-driven coverage.",
    },
    {
      type: "scripted",
      icon: Code2,
      tone: "success" as const,
      tagline: "Raw TestCafe. Full control.",
      body: "When the flow doesn’t fit a template, drop down to a real TestCafe body with the `t` controller and the current `run`. This is how every the app under test case is written — multi-step flows, API calls, custom waits.",
    },
  ];
  return (
    <Section
      kicker="Writing cases"
      title="Three flavours of test case"
      lead="A case’s scriptType decides how much testora does for you versus how much control you take."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {flavors.map((f) => (
          <Card key={f.type} className="bg-card/60">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <div className={cn("rounded-md p-1.5", toneBg(f.tone))}>
                  <f.icon className="h-4 w-4" />
                </div>
                <code className="text-sm font-semibold">{f.type}</code>
              </div>
              <div className="text-sm font-medium">{f.tagline}</div>
              <p className="text-sm text-muted-foreground">{f.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <CodeBlock label="a scripted body — you get `t` (TestCafe) and `run` (the current params)">{`// LOGIN_ATTEMPT_SCRIPT — runs once per entry in the case's runs[]
const email = Selector('[data-testid="login-email"]');
const submit = Selector('[data-testid="login-submit"]');

// Hydration gate: the submit button is disabled until React hydrates.
await t.expect(submit.hasAttribute('disabled')).notOk({ timeout: 60000 });

await t.typeText(email, run.email, { replace: true });
await t.typeText(Selector('[data-testid="login-password"]'), run.password, { replace: true });
await t.click(submit);

// Assert observable behaviour, not a brittle redirect or toast string:
const authed = await t.eval(() => !!localStorage.getItem('auth_token'));
await t.expect(authed).eql(run.expectAuth, run.scenario);`}</CodeBlock>
    </Section>
  );
}

function Environments() {
  return (
    <Section
      kicker="Environments"
      title="One switch moves every test between local and live"
      lead="The requirement owns the environment root. Fixtures point at it with a relative path — so flipping a requirement from your dev box to production re-points all of its fixtures at once."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-accent" />
              Dev environment
            </CardTitle>
            <CardDescription>What the seeded examples target out of the box.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            <KV k="Frontend" v="http://localhost:3233" />
            <KV k="API" v="http://localhost:3234/api/v1" />
            <KV k="Secret" v="WEBAPP_ADMIN_PASSWORD (env)" />
            <KV k="API override" v="WEBAPP_API_URL (env)" />
          </CardContent>
        </Card>
        <Card className="bg-card/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-primary" />
              How baseUrl resolves
            </CardTitle>
            <CardDescription>Fixture baseUrl, three behaviours.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            <ResolveRow path={`"/en/login"`} note="relative → joined onto the requirement root" result="http://localhost:3233/en/login" />
            <ResolveRow path={`"https://app.example.com/en/login"`} note="absolute → full override" result="https://app.example.com/en/login" />
            <ResolveRow path={`""`} note="empty → the requirement root itself" result="http://localhost:3233" />
          </CardContent>
        </Card>
      </div>
      <Tip icon={ShieldCheck}>
        Secrets never live in the catalog. Scripts read them from the environment at run time
        (e.g. <code className="rounded bg-muted px-1">process.env.WEBAPP_ADMIN_PASSWORD</code>), and
        runs pass a sentinel like <code className="rounded bg-muted px-1">{"\"__VALID__\""}</code> to
        request “the real password” without ever storing it.
      </Tip>
    </Section>
  );
}

function WorkedExample() {
  const steps = [
    {
      title: "Define the requirement",
      body: "Create an FR for the capability and set its environment root. For the app under test login that’s Authentication @ http://localhost:3233.",
      href: "/requirements",
      cta: "Open Requirements",
    },
    {
      title: "Add a suite",
      body: "Group related fixtures. “Login Flow” lives under Authentication and will hold every login scenario.",
      href: "/suites",
      cta: "Open Suites",
    },
    {
      title: "Create a fixture",
      body: "Point at the page: “Login using email/password” with baseUrl /en/login. testora resolves it to the dev frontend automatically.",
      href: "/fixtures",
      cta: "Open Fixtures",
    },
    {
      title: "Write the cases",
      body: "One per behaviour: valid login, wrong password, bad email format, missing fields, brute-force, rate-limit. Use runs[] to cover several inputs in a single case.",
      href: "/cases",
      cta: "Open Test Cases",
    },
    {
      title: "Run & watch",
      body: "Pick the fixture (or the whole Login Flow suite) on Run Tests and watch TestCafe stream a real Chrome session in the live console.",
      href: "/run",
      cta: "Open Run Tests",
    },
    {
      title: "Read the results",
      body: "Every case (and every run within it) lands in Results with status, duration and the exact error text the console showed.",
      href: "/results",
      cta: "Open Results",
    },
  ];
  return (
    <Section
      kicker="End to end"
      title="Build a capability’s coverage in six moves"
      lead="The same path works for any app. Here it is for the app under test’s login — from empty catalog to green checks."
    >
      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => (
          <li key={s.title}>
            <Card className="bg-card/60">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                  {i + 1}
                </div>
                <div className="flex-1">
                  <div className="font-medium">{s.title}</div>
                  <p className="text-sm text-muted-foreground">{s.body}</p>
                </div>
                <Button asChild variant="outline" size="sm" className="sm:ml-auto">
                  <Link href={s.href}>
                    {s.cta}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </li>
        ))}
      </ol>
    </Section>
  );
}

function RunningTests() {
  const scopes = [
    { icon: FlaskConical, name: "Fixture", body: "Just this page/endpoint and its cases. The tightest loop while iterating." },
    { icon: Boxes, name: "Suite", body: "Every fixture in the suite, in order — e.g. all of “Supported listing sites”." },
    { icon: ListChecks, name: "Requirement", body: "Every fixture across every suite under the capability. The full regression net." },
  ];
  return (
    <Section
      kicker="Running"
      title="Choose your blast radius"
      lead="On the Run Tests page, pick a scope and a target. Higher scopes simply execute all the fixtures nested beneath them, one after another, into one streamed run."
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {scopes.map((s) => (
          <Card key={s.name} className="bg-card/60">
            <CardContent className="flex flex-col gap-2 p-5">
              <div className="flex items-center gap-2">
                <s.icon className="h-4 w-4 text-accent" />
                <span className="font-medium">{s.name}</span>
              </div>
              <p className="text-sm text-muted-foreground">{s.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FeatureRow icon={Terminal} title="Live console">
          Color-coded TestCafe output streams as it happens — green for passes, red for failures,
          yellow for warnings. It keeps streaming even if you navigate to another page.
        </FeatureRow>
        <FeatureRow icon={Zap} title="Cancel anytime">
          A run executes server-side. Hit Cancel and the abort signal propagates straight into
          TestCafe; between fixtures, remaining work is skipped cleanly.
        </FeatureRow>
        <FeatureRow icon={Repeat} title="Multi-run cases">
          A case with N entries in runs[] shows up as “…(run 1)…(run N)”, each independently
          pass/fail, so one case can prove a whole matrix.
        </FeatureRow>
        <FeatureRow icon={Workflow} title="Survives reloads">
          The active run id is remembered, so a full page refresh re-attaches to the same run and
          replays its log and final result.
        </FeatureRow>
      </div>
    </Section>
  );
}

function ReadingResults() {
  return (
    <Section
      kicker="Results"
      title="Every run, attributable all the way up"
      lead="Results are joined back through case → fixture → suite → requirement, so you can filter at any level and the stored error text matches exactly what the live console showed."
    >
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Case</th>
              <th className="px-4 py-2 font-medium">Run</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Why it matters</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <ResultRow case_="Valid login succeeds" run="—" status="passed" why="A real session token landed in localStorage." />
            <ResultRow case_="Login fails with invalid password" run="run 1 / 2" status="passed" why="Rejected, no session, stayed on /login." />
            <ResultRow case_="Login is rate-limited after failures" run="—" status="passed" why="API returned HTTP 429 after a rapid burst." />
            <ResultRow case_="User can generate a video from a URL" run="—" status="failed" why="Wizard never reached awaiting_approval in time." />
          </tbody>
        </table>
      </div>
      <Tip icon={FileBarChart}>
        Because failures store the formatted TestCafe error, the Results page is enough to triage
        most breakages without re-running anything.
      </Tip>
    </Section>
  );
}

function Recipes() {
  const recipes = [
    {
      icon: AlertTriangle,
      title: "Beat the hydration race",
      problem: "SSR renders the input before React wires its onChange — a single typeText gets wiped by the first re-render.",
      fix: "Gate on a hydration signal (the submit/Start button enabling), then type and re-type until the value sticks.",
    },
    {
      icon: Zap,
      title: "API net + browser smoke",
      problem: "Driving the full browser wizard for every variation is slow and flaky.",
      fix: "Cover the matrix fast through t.request against the API, then keep one thin browser case to prove the real flow end-to-end. (See the app under test’s scraper-routing vs scraper-live.)",
    },
    {
      icon: Repeat,
      title: "Keep success cases re-runnable",
      problem: "A passing sign-up creates a user — run it twice and the unique-email constraint trips.",
      fix: "Generate a fresh plus-addressed email per run (asafarim+e2e<unique>@gmail.com) so the suite is idempotent.",
    },
    {
      icon: ShieldCheck,
      title: "Live within rate limits",
      problem: "/auth/login is throttled to 10/60s; logging in per run trips the throttler.",
      fix: "Authenticate once per fixture, cache the JWT on globalThis with a TTL under expiry, and retry only on an unexpected 429.",
    },
  ];
  return (
    <Section
      kicker="Field notes"
      title="Patterns that survive a real app"
      lead="These are the exact tactics the example suites use to stay green against a live, race-prone dev server. Steal them for your own app."
    >
      <div className="grid gap-4 sm:grid-cols-2">
        {recipes.map((r) => (
          <Card key={r.title} className="bg-card/60">
            <CardContent className="flex flex-col gap-3 p-5">
              <div className="flex items-center gap-2">
                <div className="rounded-md bg-accent/15 p-1.5 text-accent">
                  <r.icon className="h-4 w-4" />
                </div>
                <span className="font-medium">{r.title}</span>
              </div>
              <p className="text-sm">
                <span className="text-muted-foreground">Trap — </span>
                {r.problem}
              </p>
              <p className="text-sm">
                <span className="text-success">Fix — </span>
                {r.fix}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </Section>
  );
}

function BringYourOwnApp() {
  const checklist = [
    "Pick a capability and create a Functional Requirement with its environment root (your dev URL).",
    "Add a Suite for each coherent group of scenarios.",
    "Create Fixtures for the pages or endpoints, using relative baseUrls so you can flip environments later.",
    "Add stable selectors in your app (data-testid) — they make scripted cases dramatically less brittle.",
    "Write cases: start declarative (single/multi), drop to scripted when the flow gets real.",
    "Assert observable state (storage, network status, DOM) over brittle redirects or localized strings.",
    "Run the fixture, then promote to suite/requirement runs once it’s green.",
  ];
  return (
    <Section
      kicker="Make it yours"
      title="Adapting testora to any app"
      lead="Nothing here is app-specific. Swap the URLs and selectors and the same workflow models a checkout, a dashboard, an onboarding wizard — anything with a browser or an API."
    >
      <Card className="bg-card/60">
        <CardContent className="flex flex-col gap-3 p-5">
          {checklist.map((item, i) => (
            <div key={i} className="flex items-start gap-3 text-sm">
              <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border text-xs text-muted-foreground">
                {i + 1}
              </div>
              <span>{item}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </Section>
  );
}

function CheatSheet() {
  return (
    <Section kicker="Reference" title="One-screen cheat sheet">
      <div className="grid gap-4 sm:grid-cols-2">
        <CodeBlock label="vocabulary">{`Requirement  what + where (env root)
Suite        a coherent group of fixtures
Fixture      one page/endpoint + setup
Case         one behaviour to prove
run          one parameterised execution
Result       outcome of a case (per run)`}</CodeBlock>
        <CodeBlock label="scriptType">{`single    declarative: fill → submit → assert
multi     single, repeated over runs[]
scripted  raw TestCafe body: t + run`}</CodeBlock>
        <CodeBlock label="baseUrl resolution">{`"/path"          → <FR root> + /path
"https://x/path" → absolute override
""               → <FR root> itself`}</CodeBlock>
        <CodeBlock label="assert what you can see">{`localStorage token  → logged in
HTTP 429            → rate limited
stays on /login     → rejected
res.status / body   → API behaviour`}</CodeBlock>
      </div>
    </Section>
  );
}

function FooterCta() {
  return (
    <Card className="relative overflow-hidden border-border bg-card">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-primary/15 to-accent/15" />
      <CardContent className="relative flex flex-col items-center gap-4 p-8 text-center">
        <Rocket className="h-7 w-7 text-accent" />
        <div className="text-lg font-semibold">That’s the whole loop.</div>
        <p className="max-w-xl text-sm text-muted-foreground">
          Model the behaviour, run it against the real app, read the verdict. Start with the seeded
          example requirements, or wire up your own.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link href="/run">
              <PlayCircle className="h-4 w-4" />
              Go to Run Tests
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Back to Dashboard</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

function Section({
  kicker,
  title,
  lead,
  children,
}: {
  kicker: string;
  title: string;
  lead?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">{kicker}</span>
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        {lead && <p className="max-w-2xl text-muted-foreground">{lead}</p>}
      </div>
      {children}
    </section>
  );
}

function CodeBlock({ label, children }: { label?: string; children: string }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-black/60">
      {label && (
        <div className="flex items-center gap-2 border-b border-border/60 px-4 py-2 text-xs text-muted-foreground">
          <Code2 className="h-3.5 w-3.5" />
          {label}
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-xs leading-relaxed text-green-300/90">
        <code>{children}</code>
      </pre>
    </div>
  );
}

function Tip({ icon: Icon, children }: { icon: typeof Lightbulb; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-accent/30 bg-accent/10 p-4 text-sm">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
      <p className="text-foreground/90">{children}</p>
    </div>
  );
}

function FeatureRow({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Terminal;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card/60 p-4">
      <div className="rounded-md bg-primary/15 p-1.5 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-sm text-muted-foreground">{children}</p>
      </div>
    </div>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{k}</span>
      <code className="rounded bg-muted px-2 py-0.5 text-xs">{v}</code>
    </div>
  );
}

function ResolveRow({ path, note, result }: { path: string; note: string; result: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border/60 p-2.5">
      <div className="flex items-center gap-2">
        <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{path}</code>
        <span className="text-xs text-muted-foreground">{note}</span>
      </div>
      <code className="text-xs text-accent">→ {result}</code>
    </div>
  );
}

function ResultRow({
  case_,
  run,
  status,
  why,
}: {
  case_: string;
  run: string;
  status: "passed" | "failed";
  why: string;
}) {
  return (
    <tr>
      <td className="px-4 py-2">{case_}</td>
      <td className="px-4 py-2 text-muted-foreground">{run}</td>
      <td className="px-4 py-2">
        <Badge variant={status === "passed" ? "success" : "destructive"}>{status}</Badge>
      </td>
      <td className="px-4 py-2 text-muted-foreground">{why}</td>
    </tr>
  );
}

function toneBg(tone: "primary" | "accent" | "success" | "muted"): string {
  switch (tone) {
    case "primary":
      return "bg-primary/15 text-primary";
    case "accent":
      return "bg-accent/15 text-accent";
    case "success":
      return "bg-success/20 text-success";
    default:
      return "bg-muted text-muted-foreground";
  }
}

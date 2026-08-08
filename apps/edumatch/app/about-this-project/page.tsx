import type { Metadata } from "next";
import Link from "next/link";
import {
  BadgeCheck,
  BrainCircuit,
  Building,
  CalendarClock,
  Check,
  Clock3,
  FlaskConical,
  Github,
  Layers,
  Mail,
  ShieldCheck,
  Sparkles,
} from "lucide-react";

const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "https://asafarim.com";

export const metadata: Metadata = {
  title: "Behind EduMatch | EduMatch",
  description:
    "EduMatch is a fully working tutoring marketplace built solo by Ali Safari as a showcase for the ASafarIM Platform. What's real, what's mocked, and how to work with the person who built it.",
};

const REAL = [
  {
    icon: BrainCircuit,
    title: "AI-guided matching & explanations",
    body: "Student inquiries get real moderated AI responses and tutor matches, ranked by subject fit, distance, and rating — not hardcoded demo data.",
  },
  {
    icon: ShieldCheck,
    title: "Real single sign-on & RBAC",
    body: "One account, shared across every ASafarIM app. Student, tutor, admin, and superadmin permissions are enforced and tested, not decorative.",
  },
  {
    icon: Layers,
    title: "A real shared data layer",
    body: "Postgres + Prisma, the same database and schema conventions as seven other production apps on the platform — not a throwaway sandbox DB.",
  },
  {
    icon: CalendarClock,
    title: "Full booking & dispute lifecycle",
    body: "Quote → accept → schedule → complete/cancel/dispute → admin resolution, with audit logging and notifications at every step.",
  },
];

const MOCKED = [
  {
    icon: FlaskConical,
    title: "Money never actually moves",
    body: "The Stripe Connect checkout flow runs for real — it creates PaymentIntents and renders Stripe's own UI — but nothing here is a live business, so there's no real payout on the other end.",
  },
];

const HIRE_OPTIONS = [
  {
    icon: Building,
    title: "Employee",
    body: "Full-time, embedded in your team, full-stack ownership.",
  },
  {
    icon: Clock3,
    title: "Flexi-job",
    body: "On-demand hours, scale up or down as the project needs.",
  },
  {
    icon: BadgeCheck,
    title: "Part-time",
    body: "A few regular days a week, ongoing collaboration.",
  },
];

export default function AboutThisProjectPage() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-16">
      <div className="edu-eyebrow">
        <Sparkles size={15} /> Behind EduMatch
      </div>
      <h1 className="mt-6 text-4xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl">
        This is a demo. It&apos;s also proof.
      </h1>
      <p className="mt-6 max-w-2xl text-lg leading-relaxed text-[var(--color-text-muted)]">
        EduMatch is a fully working tutoring marketplace — AI-guided matching, bookings,
        disputes, an admin console, the works — built solo by{" "}
        <a href={webUrl} className="font-medium text-[var(--color-text)] underline underline-offset-4">
          Ali Safari
        </a>{" "}
        as a showcase for the ASafarIM Platform. Everything on this page is about what it
        demonstrates, not a pitch for the product itself — EduMatch isn&apos;t a live business.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <a href="#hire" className="edu-button edu-button-primary">
          Want something like this?
        </a>
        <a href={`${webUrl}/contact`} className="edu-button edu-button-secondary">
          <Mail size={16} /> Get in touch
        </a>
      </div>

      {/* What's real / what's mocked */}
      <section className="mt-20">
        <span className="edu-kicker">What&apos;s real, what&apos;s mocked</span>
        <h2 className="mt-3 text-2xl font-bold text-[var(--color-text)]">
          No smoke, just one honest exception.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">
          Everything below runs against real infrastructure — the same database, auth, and
          deployment pipeline as the rest of the ASafarIM Platform. The one deliberate exception
          is money: it stays mocked because this isn&apos;t a real marketplace.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          {REAL.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <item.icon size={22} className="text-[var(--color-accent)]" />
              <h3 className="mt-4 font-semibold text-[var(--color-text)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {item.body}
              </p>
            </div>
          ))}
          {MOCKED.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-muted)] p-6 sm:col-span-2"
            >
              <item.icon size={22} className="text-[var(--color-warning)]" />
              <h3 className="mt-4 font-semibold text-[var(--color-text)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Want one like this? */}
      <section id="hire" className="mt-20 scroll-mt-24">
        <span className="edu-kicker">Want one like this — or better?</span>
        <h2 className="mt-3 text-2xl font-bold text-[var(--color-text)]">
          My products are free. My time isn&apos;t.
        </h2>
        <p className="mt-3 max-w-2xl text-[var(--color-text-muted)]">
          If you&apos;re evaluating me for a role, a project, or a team, EduMatch is the kind of
          system I build: production infrastructure, not a prototype. I&apos;m open to joining
          projects and teams in whichever shape fits how you work.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {HIRE_OPTIONS.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6"
            >
              <item.icon size={22} className="text-[var(--color-primary)]" />
              <h3 className="mt-4 font-semibold text-[var(--color-text)]">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-[var(--color-text-muted)]">
                {item.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Direct CTA */}
      <section className="mt-20 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-10 text-center">
        <h2 className="text-2xl font-bold text-[var(--color-text)]">Let&apos;s talk — in writing.</h2>
        <p className="mx-auto mt-3 max-w-md text-[var(--color-text-muted)]">
          Email is the fastest way to reach me. Tell me what you&apos;re building, roughly when,
          and what done looks like.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <a href={`${webUrl}/contact`} className="edu-button edu-button-primary">
            <Mail size={16} /> Send a message
          </a>
          <a
            href={webUrl}
            className="edu-button edu-button-secondary"
          >
            Visit asafarim.com
          </a>
          <a
            href="https://github.com/AliSafari-IT"
            target="_blank"
            rel="noreferrer"
            className="edu-button edu-button-secondary"
          >
            <Github size={16} /> Browse the code
          </a>
        </div>
        <p className="mt-6 text-xs text-[var(--color-text-subtle)]">
          <Link href="/" className="underline underline-offset-4">
            ← Back to EduMatch
          </Link>
        </p>
      </section>
    </div>
  );
}

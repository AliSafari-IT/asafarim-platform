import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin, Code, FlowChart, Stat, StatusBar } from "../_shared";

export const metadata: Metadata = { title: "One-Page Summary · Business Plan · EduMatch Admin" };

// Counted from the module table on the main Business Plan page (M01–M24) —
// kept as a plain literal rather than derived from that page's JSX badges,
// since this page's whole point is to be readable without opening that one.
// Re-count by hand if a module's status changes there.
const MODULE_COUNTS = { live: 19, partial: 3, todo: 2 } as const;

export default async function OnePageSummaryPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <Link
        href="/admin/business-plan"
        className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        ← Back to Business Plan
      </Link>

      {/* Header */}
      <div className="mt-4">
        <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">ONE-PAGE SYSTEM SUMMARY</div>
        <h1 className="mt-1 font-serif text-4xl text-[var(--color-text)]">EduMatch</h1>
        <p className="mt-2 max-w-[60ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          Everything on one screen: what it is, how it&rsquo;s built, how it earns, and what&rsquo;s left to do.
          Every claim here is expanded, with citations to the code, in the full plan.
        </p>
      </div>

      {/* Stat strip */}
      <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Stat value="19 / 24" label="Modules live" tone="positive" />
        <Stat value="15%" label="Platform fee" />
        <Stat value="1" label="Deployable app" />
        <Stat value="≤5" label="Tutors per match" />
      </div>

      {/* What it is */}
      <section className="mt-8">
        <h2 className="mb-2 font-serif text-lg text-[var(--color-text)]">What it is</h2>
        <p className="text-[14px] leading-relaxed text-[var(--color-text-muted)]">
          An AI-first learning assistant that helps a student immediately where it can, and — only once it knows
          precisely what&rsquo;s needed — matches up to five verified tutors, each with an AI-drafted proposal a
          tutor must explicitly approve before it reaches the student.
        </p>
      </section>

      {/* The flow */}
      <section className="mt-6">
        <h2 className="mb-2 font-serif text-lg text-[var(--color-text)]">The flow</h2>
        <FlowChart
          steps={["Ask", "Understand", "Clarify", "Help now", "Build brief", "Match (≤5)", "Proposals", "Compare", "Book", "Learn", "Track"]}
        />
      </section>

      {/* Three-up: business / trust / architecture */}
      <div className="mt-8 grid gap-5 sm:grid-cols-3">
        <div>
          <h2 className="mb-2 font-serif text-base text-[var(--color-text)]">Business</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-snug text-[var(--color-text-muted)]">
            <li>Free through matching; 15% fee on completed bookings</li>
            <li>EduMatch Pro planned as a lower-fee tutor subscription, later</li>
            <li>Launch narrow — Maths + Sciences, Secondary — supply before spend</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 font-serif text-base text-[var(--color-text)]">Trust</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-snug text-[var(--color-text-muted)]">
            <li>Reviews require a <Code>COMPLETED</Code> booking — no exceptions</li>
            <li>Ranking: subject, level, language, availability, proximity, rating, response — never payment</li>
            <li>Homepage states plainly what&rsquo;s real vs. synthetic demo data</li>
          </ul>
        </div>
        <div>
          <h2 className="mb-2 font-serif text-base text-[var(--color-text)]">Architecture</h2>
          <ul className="list-disc space-y-1.5 pl-4 text-[13px] leading-snug text-[var(--color-text-muted)]">
            <li>Modular monolith — one deploy, explicit internal boundaries</li>
            <li>One domain module per file under <Code>lib/server/</Code></li>
            <li>Split into services only when a real trigger shows up</li>
          </ul>
        </div>
      </div>

      {/* Module status */}
      <section className="mt-8">
        <h2 className="mb-2 font-serif text-lg text-[var(--color-text)]">Build status — 24 modules</h2>
        <StatusBar
          segments={[
            { value: MODULE_COUNTS.live, label: "Live", className: "bg-emerald-500" },
            { value: MODULE_COUNTS.partial, label: "Partial", className: "bg-amber-500" },
            { value: MODULE_COUNTS.todo, label: "Not yet built", className: "bg-red-500" },
          ]}
        />
        <p className="mt-3 text-[13px] text-[var(--color-text-muted)]">
          Not yet built: guardian approval gate for minors, dedicated diagnostic-step exercise UI. Partial: voice
          recording UI, push notifications, fr/de/lb localisation.
        </p>
      </section>

      {/* Sequencing */}
      <section className="mt-8">
        <h2 className="mb-2 font-serif text-lg text-[var(--color-text)]">Sequencing</h2>
        <div className="space-y-2 text-[13px] leading-snug">
          <p><span className="font-semibold text-red-400">P0</span> <span className="text-[var(--color-text-muted)]">— login → intake → match → proposal → send → compare → book, unbroken, before any real money.</span></p>
          <p><span className="font-semibold text-amber-400">P1</span> <span className="text-[var(--color-text-muted)]">— live Stripe, full verification, messaging, scheduling, dispute handling, security review.</span></p>
          <p><span className="font-semibold text-[var(--color-text-muted)]">P2</span> <span className="text-[var(--color-text-muted)]">— EduMatch Pro, analytics, more languages, multi-country.</span></p>
        </div>
      </section>

      {/* North star */}
      <section className="mt-8 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-3.5">
        <div className="text-xs font-semibold tracking-wide text-[var(--color-primary)]">NORTH STAR</div>
        <p className="mt-1 text-[14px] text-[var(--color-text)]">
          Completed, trusted learning sessions — a <Code>COMPLETED</Code> booking paired with an <Code>ATTENDED</Code>{" "}
          session record. Not leads. Not proposals sent. A real session that actually happened.
        </p>
      </section>

      {/* Read more */}
      <section className="mt-10 border-t border-[var(--color-border)] pt-6">
        <h2 className="mb-3 font-serif text-base text-[var(--color-text)]">Read more</h2>
        <div className="flex flex-wrap gap-2.5 text-sm">
          <Link href="/admin/business-plan" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-surface)]">
            Full business plan
          </Link>
          <Link href="/admin/business-plan/architecture" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-surface)]">
            Technical architecture review
          </Link>
          <Link href="/admin/business-plan/screenshots" className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-[var(--color-text)] transition hover:bg-[var(--color-surface)]">
            Captured screens
          </Link>
        </div>
      </section>

      <div className="mt-10 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-muted)]">
        EduMatch — One-Page System Summary · v1.0 · ASafarIM Digital / Probex Belgium
      </div>
    </div>
  );
}

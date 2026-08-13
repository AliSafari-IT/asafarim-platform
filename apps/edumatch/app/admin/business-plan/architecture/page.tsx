import type { Metadata } from "next";
import Link from "next/link";
import {
  requireSuperAdmin,
  Section,
  Pull,
  FlowChart,
  FlowDown,
  Code,
  Table,
  Boundary,
  DomainBox,
} from "../_shared";

export const metadata: Metadata = { title: "Technical Architecture Review · Business Plan · EduMatch Admin" };

const domains = [
  ["Intake & Brief", "learning-briefs, learning-intake, learning-brief"],
  ["Matching", "brief-matching, tutor-matching"],
  ["Proposals & Quotes", "lesson-proposals, quotes, brief-flow"],
  ["Bookings", "bookings, student-guard"],
  ["Payments", "stripe, wallet"],
  ["Reviews", "moderation, reviews"],
  ["Learning Journey", "learning-journey, session-records"],
  ["Tutor & Student Profiles", "profiles, tutor-verification"],
  ["Admin & Audit", "admin, audit"],
];

const splitTriggers: [string, React.ReactNode][] = [
  ["Independent scaling need", "One domain's load stops correlating with the rest — e.g. AI inference traffic that spikes independently of booking volume."],
  ["Independent deploy cadence", "A different team owns a domain and needs to ship on its own schedule, without coordinating releases with the rest of EduMatch."],
  ["Outgrowing the shared instance", "A domain's write volume or storage needs start contending with the rest of the schema on the same Postgres instance."],
  ["Real reuse beyond EduMatch", "Another app on the platform needs the matching engine (or another domain) as a service in its own right, not copy-pasted logic."],
];

export default async function ArchitectureReviewPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <Link
        href="/admin/business-plan"
        className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
      >
        ← Back to Business Plan
      </Link>

      <div className="mt-4">
        <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">APPENDIX</div>
        <h1 className="mt-1 font-serif text-4xl text-[var(--color-text)]">Technical architecture review</h1>
        <p className="mt-3 max-w-[65ch] text-[15px] leading-relaxed text-[var(--color-text-muted)]">
          EduMatch starts life as a <strong className="text-[var(--color-text)]">modular monolith with explicit
          internal boundaries</strong> — one deployable app, internally organized so that splitting a piece out
          later is a mechanical exercise, not a rewrite.
        </p>
      </div>

      <Section title="The call, stated plainly">
        <p>
          A microservice architecture pays for itself when a system has outgrown one deploy, one database, or one
          team — none of which is true for EduMatch yet. What it buys instead, this early, is network calls where
          function calls used to be, distributed transactions where a single Postgres transaction used to be, and
          an operations burden (service discovery, per-service CI/CD, cross-service observability) with nothing on
          the other side of the ledger to pay for it.
        </p>
        <p>
          The alternative isn&rsquo;t &ldquo;no architecture&rdquo; — it&rsquo;s the same domain boundaries a
          microservice split would use, kept inside one process and enforced by module structure instead of a
          network hop. That&rsquo;s what&rsquo;s already in the codebase, whether or not it&rsquo;s been named as a
          deliberate choice before now.
        </p>
        <Pull>Boundaries are a design decision. A network hop between them is a deployment decision — and it&rsquo;s the second one that&rsquo;s premature, not the first.</Pull>
      </Section>

      <Section title="What's already running, layer by layer">
        <p>Every request takes the same path today — one process, one deploy, one transaction boundary:</p>
        <FlowDown
          stages={[
            { label: "Client", note: "Browser — student, tutor, or admin surfaces" },
            { label: "Next.js App Router", note: "Pages + route handlers, e.g. app/api/tutor/profile/route.ts" },
            { label: "Domain modules", note: "lib/server/*.ts — one file per bounded domain, a narrow exported function surface", tone: "gate" },
            { label: "Prisma", note: "Typed client over the shared platform schema" },
            { label: "PostgreSQL", note: "One instance, one schema, one transaction boundary", tone: "result" },
          ]}
        />
      </Section>

      <Section title="The boundary that already exists vs. the one that would be premature">
        <p>
          Laid out side by side: what EduMatch actually runs as today, and the microservice-shaped version of the
          same domains that this plan deliberately isn&rsquo;t building yet.
        </p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Boundary label="TODAY" sublabel="One process, one deploy, one Postgres instance" tone="positive">
            {domains.map(([label, note]) => (
              <DomainBox key={label} label={label} note={note} emphasis="positive" />
            ))}
          </Boundary>
          <Boundary label="NOT YET" sublabel="Same domains, each its own deploy, its own database, its own network calls" tone="negative">
            {domains.map(([label]) => (
              <DomainBox key={label} label={label} note="own service · own deploy" emphasis="negative" />
            ))}
          </Boundary>
        </div>
        <p className="mt-5">
          Every box in the left boundary already corresponds to one file under <Code>lib/server/</Code> — the
          boundary isn&rsquo;t aspirational, it&rsquo;s just not enforced by a network call. The right boundary is
          the same map redrawn with every arrow between boxes turned into an HTTP call, a retry policy, and a
          failure mode that didn&rsquo;t exist before.
        </p>
      </Section>

      <Section title="What “explicit internal boundaries” means in practice">
        <p>Four things already true in the codebase, not aspirations for later:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-[var(--color-text)]">One file, one domain, a narrow export surface.</strong>{" "}
            <Code>tutor-matching.ts</Code>, <Code>quotes.ts</Code>, <Code>learning-journey.ts</Code> — each domain
            owns its logic behind a small set of exported functions. Nothing outside the file reaches into another
            domain&rsquo;s internals.
          </li>
          <li>
            <strong className="text-[var(--color-text)]">Prefixed, scoped data models.</strong> Every EduMatch table
            is <Code>Edu*</Code> in the shared platform schema — <Code>EduBooking</Code>, <Code>EduQuote</Code>,{" "}
            <Code>EduSessionRecord</Code> — sharing a Postgres instance with the rest of the platform without
            sharing a namespace with it.
          </li>
          <li>
            <strong className="text-[var(--color-text)]">Cross-domain calls go through functions, not shared
            mutable state.</strong> <Code>brief-flow.matchAndInvite</Code> calls into the matching domain and the
            proposals domain by calling their exported functions — the same shape a service call would have, minus
            the network.
          </li>
          <li>
            <strong className="text-[var(--color-text)]">Cross-cutting concerns stay cross-cutting.</strong> Audit
            logging and admin diagnostics wrap domain calls rather than living inside any one of them — exactly
            where they&rsquo;d need to sit if a domain were ever pulled out into its own service.
          </li>
        </ul>
      </Section>

      <Section title="When a split would actually pay for itself">
        <p>Four concrete triggers — any one of them is a legitimate reason to extract a domain. None of them are true yet:</p>
        <Table
          head={["Trigger", "What it looks like"]}
          rows={splitTriggers}
        />
      </Section>

      <Section title="The extraction path, when the day comes">
        <p>
          This is the entire point of keeping the boundaries explicit now: extracting a domain later is swapping
          one arrow, not redesigning the system.
        </p>
        <FlowChart
          steps={[
            "Domain module (lib/server/*.ts)",
            "Narrow exported API",
            "Wrap the export in a network boundary",
            "Deploy separately",
          ]}
        />
        <p className="mt-5">
          Because step one and two are already true today, step three is the only new work whenever a real trigger
          shows up — and by then there&rsquo;ll be real traffic data to size the new service against, instead of a
          guess made in advance of any usage at all.
        </p>
      </Section>

      <div className="mt-16 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-muted)]">
        EduMatch Business Plan v1.0 · Technical Architecture Review · ASafarIM Digital / Probex Belgium
      </div>
    </div>
  );
}

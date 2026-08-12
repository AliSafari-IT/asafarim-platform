import type { Metadata } from "next";
import Link from "next/link";
import { requireSuperAdmin } from "./_shared";

export const metadata: Metadata = { title: "Business Plan · EduMatch Admin" };

// This page is intentionally not linked from the admin sidebar (AdminShell) —
// it's reachable only via the "B.Plan" link in the top navbar, and that link
// only renders for the exact "superadmin" role (see EduNav.tsx). Access is
// gated by requireSuperAdmin() in ./_shared.ts, shared with the screenshots
// sub-page.

const badge = {
  live: "bg-emerald-500/15 text-emerald-400",
  partial: "bg-amber-500/15 text-amber-400",
  todo: "bg-red-500/15 text-red-400",
} as const;

function Badge({ tone, children }: { tone: keyof typeof badge; children: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[tone]}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function Part({ roman, title, id }: { roman: string; title: string; id: string }) {
  return (
    <div id={id} className="mt-20 scroll-mt-20 border-t border-[var(--color-border)] pt-8 first:mt-10 first:border-0 first:pt-0">
      <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">{`PART ${roman}`}</div>
      <h2 className="mt-1 font-serif text-3xl text-[var(--color-text)]">{title}</h2>
    </div>
  );
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      {title && <h3 className="mb-3 font-serif text-xl text-[var(--color-text)]">{title}</h3>}
      <div className="space-y-4 text-[15px] leading-relaxed text-[var(--color-text-muted)]">{children}</div>
    </section>
  );
}

function Pull({ children }: { children: React.ReactNode }) {
  return (
    <blockquote className="border-l-2 border-[var(--color-primary)] pl-4 font-serif text-lg italic text-[var(--color-text)]">
      {children}
    </blockquote>
  );
}

function Code({ children }: { children: string }) {
  return (
    <code className="whitespace-nowrap rounded bg-[var(--color-primary)]/10 px-1.5 py-0.5 font-mono text-[0.86em] text-[var(--color-primary)]">
      {children}
    </code>
  );
}

function Table({ head, rows }: { head: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--color-border)]">
      <table className="w-full min-w-[520px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            {head.map((h) => (
              <th key={h} className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-[var(--color-border)] last:border-0">
              {row.map((cell, j) => (
                <td key={j} className={`px-3 py-2.5 align-top ${j === 0 ? "font-medium text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const modules: [string, React.ReactNode, React.ReactNode][] = [
  ["M01 · Accounts & Auth", <>Student / Tutor / Admin via <Code>@asafarim/auth</Code>{" "}+ Hub SSO</>, <Badge tone="live">Live</Badge>],
  ["M02 · Tutor Verification", "Identity, qualifications, safeguarding clearance", <Badge tone="live">Live core</Badge>],
  ["M03 · Subjects Engine", "Subject → sub-topic → level → required brief fields", <Badge tone="live">Live</Badge>],
  ["M04 · Multimodal Intake", "Text + photo; voice transcribed via Whisper", <Badge tone="partial">Partial — recording UI pending</Badge>],
  ["M05 · AI Clarification Engine", <><Code>nextBriefQuestion</Code>, one field at a time</>, <Badge tone="live">Live</Badge>],
  ["M06 · Learning Brief", <><Code>EduLearningBrief</Code>{" "}Draft → Confirmed → Matched → Archived</>, <Badge tone="live">Live</Badge>],
  ["M07 · Self-Study Engine", "Explanation, worked example, practice, steps", <Badge tone="live">Live</Badge>],
  ["M08 · Tutor Data Engine", "Rates, subjects, availability, languages, style", <Badge tone="live">Live</Badge>],
  ["M09 · AI Proposal Engine", <Code>lesson-proposals.getOrCreatePreparedProposal</Code>, <Badge tone="live">Live</Badge>],
  ["M10 · Matching Engine", <><Code>EduMatchCandidate</Code>, 8-factor <Code>MATCH_WEIGHTS</Code></>, <Badge tone="live">Live</Badge>],
  ["M11 · Notifications", "In-app + email; push not yet built", <Badge tone="partial">Partial</Badge>],
  ["M12 · Tutor Approval", "Adjust / Decline / Approve & send", <Badge tone="live">Live</Badge>],
  ["M13 · Proposal Comparison", <Code>brief-flow.compareProposals</Code>, <Badge tone="live">Live</Badge>],
  ["M14 · Messaging", <><Code>EduMessage</Code>, in-platform chat</>, <Badge tone="live">Live</Badge>],
  ["M15 · Scheduling", "Availability + booking slots", <Badge tone="live">Live</Badge>],
  ["M16 · Payments", "Stripe checkout, 15% fee, sandboxed for the showcase", <Badge tone="live">Live sandbox</Badge>],
  ["M17 · Bookings", <Code>EduBooking</Code>, <Badge tone="live">Live</Badge>],
  ["M18 · Reviews", <><Code>EduReview</Code>, one per completed booking</>, <Badge tone="live">Live</Badge>],
  ["M19 · Learning Journey", <><Code>/student/journey</Code>{" "}session records + goal progress</>, <Badge tone="live">Live</Badge>],
  ["M20 · Disputes / Support", "Dispute workflow referenced from homepage", <Badge tone="live">Live core</Badge>],
  ["M21 · Admin Console", <><Code>/admin</Code>{" "}— payments, matching diagnostics</>, <Badge tone="live">Live</Badge>],
  ["M22 · Guardian Approval", <><Code>isMinor</Code>, guardian contact fields exist; approval gate before payment</>, <Badge tone="todo">Not yet built</Badge>],
  ["M23 · Diagnostic Step", <><Code>NEEDS_DIAGNOSTIC</Code>{" "}outcome + field exist; dedicated exercise UI</>, <Badge tone="todo">Not yet built</Badge>],
  ["M24 · Localisation", "en / nl live; fr / de / lb fall back to English", <Badge tone="partial">Partial</Badge>],
];

const metrics: [string, React.ReactNode][] = [
  ["Supply", "Active verified tutors per subject / region."],
  ["Liquidity", "Share of briefs that receive ≥3 valid proposals."],
  ["Time to first proposal", <><Code>invitedAt</Code>{" "}→ <Code>sentAt</Code></>],
  ["Tutor acceptance rate", <Code>proposalsSent / invitesReceived</Code>],
  ["Booking conversion", "Share of confirmed briefs that become a booked session."],
  ["Session completion", <>Share of bookings reaching <Code>COMPLETED</Code>{" "}with an <Code>ATTENDED</Code>{" "}session record.</>],
  ["Repeat booking rate", "Share of students who book a second session with any tutor."],
  ["Goal progress", <><Code>EduSessionRecord.goalProgress</Code>{" "}trend over time.</>],
  ["Review score", "Average verified rating, per tutor and platform-wide."],
  ["Off-platform leakage", "Estimated bookings arranged outside EduMatch after a match."],
  ["GMV / take rate", "Total session value, and EduMatch revenue as a share of it."],
];

const screens: [string, React.ReactNode, string][] = [
  ["Landing page", <Code>/</Code>, "Hero, “Ask your first question” / “Become a tutor” CTAs, showcase-project banner."],
  ["Learn intake", <Code>/student/learn</Code>, "The conversational Ask → Understand → Clarify flow."],
  ["Immediate help", <><Code>/student/learn</Code>{" "}mid-conversation</>, "The self-study panel — explanation, practice, “I still want a tutor” option."],
  ["Brief confirmation", "Brief review panel", "Editable summary before anything is shared with a tutor."],
  ["Tutor matches", "Brief matches view", "Up to five tutors, each with an explainable match reason."],
  ["Tutor invite inbox", <Code>/tutor/invites</Code>, "Incoming brief plus AI-drafted proposal, Adjust / Decline / Approve & send."],
  ["Proposal comparison", <Code>{"/student/brief/[id]/compare"}</Code>, "Side-by-side proposals — price, plan, timing, guarantees."],
  ["Checkout", <Code>{"/student/checkout/[quoteId]"}</Code>, "Stripe-backed booking confirmation."],
  ["Learning journey", <Code>/student/journey</Code>, "Session history, goal progress, documents."],
  ["Tutor earnings", <Code>/tutor/earnings</Code>, "Payout view showing the 15% platform fee applied."],
  ["Admin console", <Code>/admin</Code>, "Matching diagnostics and payments overview."],
];

export default async function BusinessPlanPage() {
  await requireSuperAdmin();

  return (
    <div className="mx-auto max-w-3xl pb-24">
      {/* Cover */}
      <div className="-mx-4 -mt-4 mb-10 rounded-b-xl bg-[var(--color-primary)]/10 px-6 py-12 sm:-mx-6 sm:px-10">
        <div className="text-xs font-semibold tracking-[0.14em] text-[var(--color-primary)]">
          BUSINESS PLAN · V1.0 · 12 AUGUST 2026
        </div>
        <h1 className="mt-3 font-serif text-4xl leading-tight text-[var(--color-text)] sm:text-5xl">EduMatch</h1>
        <p className="mt-4 max-w-[46ch] border-l-2 border-[var(--color-primary)] pl-4 font-serif text-lg italic leading-relaxed text-[var(--color-text)]">
          &ldquo;Show us what you&rsquo;re learning. We&rsquo;ll help you understand it — and find the right tutor when you need one.&rdquo;
        </p>
        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--color-text-muted)]">
          <span><strong className="text-[var(--color-text)]">Product</strong> — Live showcase build, ASafarIM Platform monorepo</span>
          <span><strong className="text-[var(--color-text)]">Location</strong> — apps/edumatch</span>
          <span><strong className="text-[var(--color-text)]">Reachable at</strong> — localhost:3009</span>
        </div>
      </div>

      {/* Restricted-visibility note */}
      <div className="mb-10 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 text-xs text-[var(--color-text-muted)]">
        Visible to superadmin only — this link doesn&rsquo;t appear in the navbar or admin sidebar for any other role.
      </div>

      {/* Executive summary */}
      <Section>
        <p className="text-[17px] text-[var(--color-text)]">
          Most tutoring platforms are directories with a checkout bolted on: a student searches, guesses, messages five
          strangers, and waits. EduMatch starts from the opposite end — it asks what a student is actually stuck on,
          tries to help right there, and only calls in a human once it knows precisely what kind of human is needed.
          That single design decision is the entire business.
        </p>
        <p>
          Everything downstream — the matching, the AI-drafted proposals, the fee model, the trust badges — exists to
          protect one promise: by the time a tutor sees a request, it already looks like a well-briefed referral from
          a colleague, not a cold lead. This document lays out what that promise costs to keep, what it&rsquo;s worth,
          and what&rsquo;s already built versus what still needs building.
        </p>
      </Section>

      {/* PART I */}
      <Part roman="I" id="idea" title="The idea" />

      <Section title="What EduMatch actually is">
        <p>
          EduMatch is not a listings page for tutors, and it isn&rsquo;t a booking calendar with a search bar on top.
          It&rsquo;s closer to a learning assistant with a rolodex: it listens to what a student is struggling with,
          helps immediately wherever it credibly can, and — only when a real person is genuinely the better answer —
          builds the case for that person, finds up to five who fit, and gets out of the way once they&rsquo;re talking.
        </p>
        <p>
          The product already enforces this discipline in code, not just in intent. This plan mostly makes explicit
          what the pipeline already does, and turns it into a story worth telling to tutors, students, and eventually
          investors.
        </p>
      </Section>

      <Section title="The one flow that defines us">
        <p>Strip away every feature and this is the shape that&rsquo;s left — also, almost verbatim, the route map already wired through the app:</p>
        <div className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 font-mono text-[13px] leading-loose text-[var(--color-text-muted)]">
          Ask <span className="text-[var(--color-primary)]">→</span> Understand <span className="text-[var(--color-primary)]">→</span> Clarify <span className="text-[var(--color-primary)]">→</span> Help now
          <br />
          <span className="text-[var(--color-primary)]">→</span> Build brief <span className="text-[var(--color-primary)]">→</span> Confirm <span className="text-[var(--color-primary)]">→</span> Match (≤5) <span className="text-[var(--color-primary)]">→</span> Prepared proposals
          <br />
          <span className="text-[var(--color-primary)]">→</span> Compare <span className="text-[var(--color-primary)]">→</span> Book <span className="text-[var(--color-primary)]">→</span> Learn <span className="text-[var(--color-primary)]">→</span> Track
        </div>
        <p>
          In the codebase: <Code>/student/learn</Code>{" "}opens the conversation,{" "}
          <Code>learning-briefs.startIntake</Code>{" "}and <Code>learning-intake.analyseIntake</Code>{" "}
          turn it into structure, <Code>learning-brief.nextBriefQuestion</Code>{" "}
          asks what&rsquo;s missing, <Code>brief-matching.matchTutorsForBrief</Code>{" "}
          and <Code>brief-flow.matchAndInvite</Code>{" "}handle the introductions,{" "}
          <Code>lesson-proposals.getOrCreatePreparedProposal</Code>{" "}drafts the offer,{" "}
          <Code>brief-flow.compareProposals</Code>{" "}lines them up, <Code>quotes.acceptQuote</Code>{" "}
          plus Stripe takes the payment, and <Code>learning-journey</Code>{" "}keeps the record afterward.
        </p>
      </Section>

      <Section title="Why this survives being copied">
        <p>
          Nobody needs our permission to wire up a large language model — a competitor can do that in a sprint. What
          they can&rsquo;t spin up in a sprint is what only accumulates from real use:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li><strong className="text-[var(--color-text)]">Knowing what to ask, and when to stop asking.</strong> The per-subject list of fields a brief needs before it&rsquo;s worth sending — and the logic that skips whatever doesn&rsquo;t apply — gets sharper with every real conversation, not with more prompt engineering.</li>
          <li><strong className="text-[var(--color-text)]">Supply that&rsquo;s actually verified.</strong> Qualifications, languages, weekly availability, safeguarding clearance for minors, teaching style — structured facts about real people, not scraped listings.</li>
          <li><strong className="text-[var(--color-text)]">A memory of what actually worked.</strong> Which proposal converted, at what price, with what plan, and whether the booking ended in a real, attended session.</li>
          <li><strong className="text-[var(--color-text)]">Reviews tied to something real.</strong> No review exists without a completed booking behind it — the reputation layer can&rsquo;t be gamed the way most can.</li>
          <li><strong className="text-[var(--color-text)]">A bench, not a database.</strong> A trusted pool of tutors per subject and region takes months of relationship-building, not a weekend of scraping.</li>
          <li><strong className="text-[var(--color-text)]">Restraint, as a brand asset.</strong> The hardest thing on this list to copy: never overstating what the AI knows. Earned by never once faking it.</li>
        </ul>
        <Pull>Geography alone isn&rsquo;t a moat. Density of verified supply, accumulated data, and earned trust are.</Pull>
      </Section>

      {/* PART II */}
      <Part roman="II" id="experience" title="The experience" />

      <Section title="Ask first, form second">
        <p>
          <Code>/student/learn</Code>{" "}opens with one open question, not a twenty-field intake form: <em>what are you
          working on?</em> A student can type it, attach a photo of the worksheet, or leave a voice note transcribed
          through the existing Whisper pipeline.
        </p>
        <p className="italic">Example: &ldquo;I don&rsquo;t understand how to factor this quadratic,&rdquo; plus a photo of the exercise.</p>
        <p>
          From there, the assistant reads whatever signal it&rsquo;s given — text, image, audio — figures out what&rsquo;s
          still missing, and asks exactly one necessary follow-up question at a time via <Code>nextBriefQuestion</Code>,
          while quietly assembling the Learning Brief underneath the conversation. The point isn&rsquo;t the AI; it&rsquo;s
          that the interaction still feels like texting a tutor friend, not filling out a service ticket.
        </p>
      </Section>

      <Section title="The brief-completeness engine">
        <p>
          Every subject carries its own minimum viable brief. For Mathematics · Secondary, that&rsquo;s typically:
          subject, sub-topic, level, preferred language, mode (online or in-person plus city), weekly availability,
          budget range, and — if the learner is a minor — a guardian contact.
        </p>
        <p>
          Internally, <Code>computeBriefCompleteness</Code>{" "}tracks a real percentage, recalculated from fields that are
          actually filled — never from what the model merely claims to have understood. Externally, the student never
          sees a raw number; they see something closer to <em>&ldquo;Almost there — two more things and I can find the
          right person.&rdquo;</em>
        </p>
        <p>
          The rule enforced in the code is simple: a hallucinated field — a guessed school year, say — leaves the
          underlying value empty, so the question still gets asked. The AI is structurally prevented from faking
          readiness.
        </p>
      </Section>

      <Section title="Teaching the AI to say &ldquo;not yet&rdquo;">
        <p>Every intake resolves to exactly one of three honest outcomes — never a guess dressed up as an answer:</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ["Self-study", "A complete, standalone explanation with a worked example and practice set. No tutor needed."],
            ["Needs diagnostic", "The brief is plausible but under-specified — more conversation, or a short diagnostic, before matching makes sense."],
            ["Needs tutor", "The brief is complete enough to go straight to matching, no detours."],
          ].map(([label, copy]) => (
            <div key={label} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
              <div className="mb-1.5 text-xs font-semibold text-[var(--color-primary)]">{label}</div>
              <p className="text-[13px] leading-snug text-[var(--color-text-muted)]">{copy}</p>
            </div>
          ))}
        </div>
        <p>This is the same discipline any trust-sensitive product needs at its core: never simulate certainty the system doesn&rsquo;t actually have.</p>
        <p>
          It also happens to be free distribution. A student who googles &ldquo;how to factor a quadratic&rdquo; usually
          lands on a video or a blog post. EduMatch can instead say <em>&ldquo;show me the problem,&rdquo;</em> then walk
          through explanation, worked example, and practice questions with academic-integrity guardrails — and when the
          student says <em>&ldquo;I still want a tutor for this,&rdquo;</em> the commercial dossier is already half-built
          from the conversation that just happened. Long-term, that&rsquo;s durable SEO territory: <em>quadratic
          factoring help, French conjugation practice, physics exam prep, essay structure</em> — each one a free-value
          entry point that already knows how to become a booking.
        </p>
      </Section>

      <Section title="A Tuesday-night tutor inbox">
        <p>
          EduMatch doesn&rsquo;t sell a tutor a phone number and walk away. It hands over a request that&rsquo;s already
          most of the way to a finished proposal. A tutor sets up once — profile and safeguarding clearance, subjects
          and levels taught, languages and teaching style, rates and session lengths, <Code>weeklyAvailability</Code>{" "}
          (used directly by the matcher), service area, and any certifications — and the AI reuses that structured data
          automatically, every time a new brief comes in.
        </p>
        <p>
          Picture the actual moment: a tutor&rsquo;s phone buzzes at dinner. <em>New EduMatch request — GCSE Maths,
          online, this week.</em> They open it and see the student&rsquo;s brief in plain terms, an AI-drafted plan and
          price already built from their own rate card, and three buttons: <strong className="text-[var(--color-text)]">Adjust</strong>,{" "}
          <strong className="text-[var(--color-text)]">Decline</strong>, <strong className="text-[var(--color-text)]">Approve
          &amp; send</strong>. Under a minute, start to finish. That&rsquo;s the pitch to tutor supply — it removes the
          unpaid admin tax that makes most marketplaces exhausting to work with.
        </p>
        <Pull>Nothing reaches a student that a tutor hasn&rsquo;t explicitly approved.</Pull>
        <p>
          This isn&rsquo;t a UX nicety, it&rsquo;s structural: a prepared proposal is created as an <Code>EduQuote</Code>{" "}
          in <Code>DRAFT</Code>{" "}and stays invisible to the student. Only <Code>POST …/send</Code>{" "}— a deliberate tutor
          action — stamps <Code>sentAt</Code>{" "}and moves it to <Code>PENDING</Code>. A tutor who edits a draft and closes
          the tab has published nothing. Every sent proposal carries a clean audit trail: a tutor&rsquo;s confirmed,
          on-record decision, not an AI acting on their behalf.
        </p>
      </Section>

      <Section title="Five seats, no bidding war">
        <p>
          <Code>matchTutorsForBrief</Code>{" "}shortlists candidates and <Code>brief-flow.matchAndInvite</Code>{" "}invites up to
          five. There&rsquo;s no featured slot, no boosted placement, nothing for sale. <Code>MATCH_WEIGHTS</Code>{" "}is a
          fixed, tested set of eight factors, every one a verified profile fact or a platform-observed behavior:
          subject, level, language, mode, schedule, rating, responsiveness, proximity.
        </p>
        <p>
          Eligibility and ranking are kept deliberately separate. Subject match, verification, safeguarding clearance
          for minors, and — for in-person requests — actual reachability are hard gates checked <em>before</em> scoring
          begins; no score buys past them. <Code>ineligibilityReason</Code>{" "}records exactly why a tutor was dropped,
          feeding straight into admin diagnostics.
        </p>
        <p>
          New tutors still get a real shot. A qualified, fully verified tutor with zero reviews would otherwise always
          lose a ratings-weighted contest to anyone with history. So the fifth of the five slots is reserved, on
          rotation by <Code>lastMatchedAt</Code>, for a newcomer whenever the top four are all established names. They
          still have to clear every hard filter — the door widens, the bar doesn&rsquo;t move.
        </p>
        <p>
          That structure also lines up with where EU marketplace rules are heading: platforms are increasingly expected
          to be transparent about their main ranking parameters. EduMatch can say, plainly: <em>we rank by subject fit,
          level, language, availability, proximity, rating, and responsiveness — never by who pays more.</em> Principles
          stated out loud, not the raw algorithm.
        </p>
      </Section>

      <Section title="Comparing offers like adults">
        <p>
          The first screen — tutor, total price, rating, reviews, earliest slot — is the entry point, not the whole
          comparison. Laid out side by side, a student also needs: total price, session count and length, mode,
          cancellation policy, earliest start date, language of instruction, plan outline, and rating with review
          count.
        </p>
        <p>
          <Code>brief-flow.compareProposals</Code>{" "}should be able to say something like <em>&ldquo;Proposal B costs €12
          more per session, but starts a week earlier and includes a diagnostic session&rdquo;</em> — helping a family
          compare, never nudging them toward one tutor as objectively &ldquo;the best.&rdquo;
        </p>
      </Section>

      {/* PART III */}
      <Part roman="III" id="trust" title="Trust & safety" />

      <Section title="Trust, said out loud">
        <p>
          A brand-new platform can&rsquo;t lean on reputation it hasn&rsquo;t earned, so trust has to be stated, not
          assumed. The homepage already does this well — it says outright that this is a showcase build, that the
          tutors shown are synthetic, and that no money changes hands yet, with a link explaining exactly what&rsquo;s
          real and what isn&rsquo;t. That candor is worth keeping even after real payments go live; it reads better
          than any claim of scale ever could.
        </p>
        <p>
          &ldquo;EduMatch Verified&rdquo; should mean something concrete: identity check, qualification and
          certification review, safeguarding clearance for anyone tutoring minors, and — once live — a track record of
          response time and completion. Future badges can layer on top: <em>Verified Tutor · Safeguarding Cleared · 50
          Sessions Completed · Fast Responder · Highly Rated.</em>
        </p>
      </Section>

      <Section title="Reviews that can&rsquo;t be faked">
        <p>
          No review from a friend, a cousin, or a burner account. <Code>leaveReview</Code>{" "}requires a{" "}
          <Code>COMPLETED</Code>{" "}<Code>EduBooking</Code>{" "}owned by the person leaving it, and{" "}
          <Code>bookingId</Code>{" "}is unique per review — there&rsquo;s no separate &ldquo;verified&rdquo; flag to
          forge, because the row itself is the proof a session happened. Ratings are recomputed from the full set of
          reviews rather than incremented one at a time, so a removed review can never leave a stale average behind.
        </p>
        <p>
          The score itself should mirror what already gets recorded per session: quality of explanation,
          communication, punctuality, value, and progress made — surfaced to students as something like <em>&ldquo;★
          4.8/5 — 42 verified sessions.&rdquo;</em>
        </p>
      </Section>

      <Section title="The record that outlives the booking">
        <p>
          Once a booking is complete, nothing disappears. <Code>/student/journey</Code>{" "}keeps session records — topics
          covered, summary, homework, next step, goal progress — alongside the tutor, the proposals, the invoices, and
          the reviews. It&rsquo;s a running account of how a student has actually progressed, not a receipts folder.
        </p>
        <p>
          Two years from now, a parent won&rsquo;t remember which tutor covered which topic and when. EduMatch will.
          That turns one booking into an ongoing family learning record — and because it depends on the session-record
          habit being embedded in how tutors already work, it&rsquo;s genuinely hard for a lead-generation competitor
          to replicate by bolting on a feature.
        </p>
      </Section>

      <Section title="Where EduMatch stands legally">
        <p>
          This needs care. EduMatch&rsquo;s actual role is to support matching, documentation, communication, payment,
          and dispute mediation — the tutoring agreement itself sits, in principle, between the student or guardian and
          the tutor, to the extent the eventual terms of service support that structure. A disclaimer alone (&ldquo;we
          are not liable&rdquo;) isn&rsquo;t sufficient on its own; what governs this is the platform&rsquo;s real
          operational role, its contract structure, and applicable consumer-protection law, all of which are moving
          toward requiring marketplaces to be transparent about exactly what kind of provider a consumer is
          contracting with. This section should be reviewed by a lawyer before any real payment goes live — the
          current build settles no real money by design.
        </p>
      </Section>

      <Section title="Money moves through one pipe">
        <p>
          <Code>quotes.acceptQuote</Code>{" "}plus Stripe already routes every payment through a marketplace-style checkout
          rather than an ad-hoc bank transfer — the right default, since it keeps one audit trail, supports refunds
          and disputes cleanly, and keeps EduMatch out of raw money-transmission territory. <Code>PLATFORM_FEE_PERCENT
          = 15</Code>{" "}is already defined in <Code>lib/server/stripe.ts</Code>{" "}and applied at both checkout and payout.
        </p>
        <p>
          As real payouts to tutors go live, one choice needs to be made deliberately rather than left as a default:
          certain Stripe Connect account types shift chargeback and dispute responsibility onto the platform. That
          decision shapes real financial exposure and shouldn&rsquo;t happen by accident.
        </p>
      </Section>

      {/* PART IV */}
      <Part roman="IV" id="business" title="The business" />

      <Section title="How EduMatch earns">
        <p>
          Value only really exists once a good match happens, so most of the funnel stays free: self-study help, the
          AI intake and Learning Brief, previewing matched tutors, and receiving and comparing up to five prepared
          proposals all cost nothing. Revenue is earned exactly where value is delivered — at a completed booking.
        </p>
        <p>
          The 15% platform fee already implemented is the anchor. Two refinements are worth testing once there&rsquo;s
          real transaction data: a small minimum fee per booking, so very short low-value sessions don&rsquo;t fall
          through the economics; and a soft cap on very large multi-session packages, so there&rsquo;s no growing
          incentive to move a big recurring engagement off-platform once trust is established. Both are hypotheses to
          validate against real tutor conversations and unit economics — not settled pricing.
        </p>
      </Section>

      <Section title="EduMatch Pro">
        <p>
          Once tutors find EduMatch genuinely useful — not before — a second tier makes sense. <strong className="text-[var(--color-text)]">EduMatch
          Free</strong> stays the default: standard 15% success fee, full matching access. <strong className="text-[var(--color-text)]">EduMatch
          Pro</strong>, priced somewhere around €19–29/month, would trade a lower success fee for AI-assisted proposal
          drafting at scale, richer availability tools, removal of the newcomer-rotation deprioritization,
          response-time and win-rate analytics, and light CRM for repeat students.
        </p>
        <p>Over time, that turns EduMatch into a marketplace with a vertical SaaS layer on top — a materially stronger business than commission revenue on its own.</p>
      </Section>

      <Section title="Why people stay on-platform">
        <p>
          Rather than policing off-platform contact after the fact, the better strategy is making the in-platform path
          clearly worth more: reviews that only exist because a booking happened here, a permanent session record and
          progress history, protected payment with real dispute support, better ranking for tutors who keep completing
          bookings on-platform, and — for anyone tutoring a minor — the safeguarding-clearance filter itself, which any
          arrangement made off-platform simply skips entirely. In-platform messaging (<Code>EduMessage</Code>) keeps
          the early conversation here rather than pushing straight to WhatsApp before any trust has actually been
          built.
        </p>
      </Section>

      <Section title="Where we open the doors first">
        <p>
          A broad subject catalogue is fine architecture and a poor launch strategy. Candidate subjects should be
          ranked by a Subject Attractiveness Score before expanding — search volume, achievable session value,
          existing tutor supply, how well the subject teaches remotely, urgency (exam season), how much comparison
          shopping it invites, EduMatch&rsquo;s margin on it, and seasonality. Launch with whichever handful score
          highest; Maths and the core Sciences at Secondary level are the obvious first wave given typical demand and
          how well they teach online.
        </p>
        <p>
          Supply has to come before student-facing marketing spend, not after — EduMatch starts with zero reputation
          either way. A <em>Founding Tutors</em> program, covering the first roughly 50–100 vetted tutors per launch
          subject and region, should offer a reduced or waived platform fee for a limited window, white-glove
          onboarding for profile and rate card, a visible Founding badge, priority support, and real input into the
          roadmap. The scarcity needs to be genuine — a capped number of spots per subject and region — not a
          marketing device.
        </p>
      </Section>

      <Section title="How we talk to tutors">
        <p>
          Every tutoring directory opens with &ldquo;want more leads?&rdquo; That&rsquo;s not the pain worth naming.
          The real one is: <em>how much time do you lose writing quotes for requests that never book?</em> The answer
          follows naturally — EduMatch drafts the proposal from a tutor&rsquo;s own rates and availability before
          they&rsquo;ve even opened the request; they check it and send. That&rsquo;s a pitch about time lost, not
          about technology.
        </p>
      </Section>

      <Section title="Earning trust with no name yet">
        <p>
          The homepage already answers the questions a skeptical first-time visitor actually has: who&rsquo;s behind
          this (ASafarIM Digital / Probex Belgium), is any of this real right now, how does the platform make money,
          what happens if something goes wrong. That honesty should survive the transition to real money —
          <em> &ldquo;we&rsquo;re new, which is exactly why we verify who tutors on EduMatch extra carefully&rdquo;</em>{" "}
          will earn more trust from a stranger than any claim to be &ldquo;the #1 AI learning platform in
          Europe.&rdquo;
        </p>
        <p>
          None of this needs to feel like an AI product to use. Nobody searches for &ldquo;AI&rdquo; — they search for{" "}
          <em>&ldquo;I don&rsquo;t understand this,&rdquo;</em> <em>&ldquo;I need a maths tutor,&rdquo;</em> or{" "}
          <em>&ldquo;how much would this cost?&rdquo;</em> The sophistication can stay entirely under the hood. Two
          lines worth testing on the brand itself: <em>&ldquo;Matched with meaning.&rdquo;</em> and{" "}
          <em>&ldquo;The right tutor doesn&rsquo;t need to be the loudest one.&rdquo;</em>
        </p>
      </Section>

      {/* PART V */}
      <Part roman="V" id="under-the-hood" title="Under the hood" />

      <Section title="What&rsquo;s already running">
        <p>Mapped against the real codebase, not a roadmap wishlist:</p>
        <Table head={["Module", "Scope", "Status"]} rows={modules} />
      </Section>

      <Section title="What we&rsquo;re deliberately not building yet">
        <ul className="list-disc space-y-2 pl-5">
          <li>A full guardian-approval payment gate — before the minors-safeguarding filter it depends on is battle-tested.</li>
          <li>A generic affiliate or materials marketplace.</li>
          <li>Fully automatic proposal sending without tutor confirmation — this must never happen, full stop.</li>
          <li>A custom payment wallet — Stripe Connect (or an equivalent) stays the rail.</li>
          <li>A complex subscription system, before EduMatch Pro has real subject-level demand to justify it.</li>
          <li>Another dashboard redesign, before the P0 loop below is airtight.</li>
        </ul>
      </Section>

      <Section title="P0 → P1 → P2">
        <div className="space-y-3">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-red-400">P0 — BEFORE ANY PILOT WITH REAL MONEY</div>
            <p className="text-[14px] text-[var(--color-text-muted)]">
              Login → intake → AI questions → confirmed Brief → tutor match (≤5) → AI-drafted proposal → tutor
              approves &amp; sends → student compares → student books. If any link in that chain breaks, EduMatch
              doesn&rsquo;t exist yet, regardless of what else is built.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-amber-400">P1 — BEFORE PUBLIC LAUNCH</div>
            <p className="text-[14px] text-[var(--color-text-muted)]">
              Real payments (live Stripe, not sandbox), full tutor verification, verified reviews, messaging,
              scheduling, learning journey, dispute handling, and a proper security review.
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="mb-1.5 text-xs font-semibold tracking-wide text-[var(--color-text-muted)]">P2 — LATER</div>
            <p className="text-[14px] text-[var(--color-text-muted)]">
              EduMatch Pro subscriptions, advanced analytics, affiliate and materials revenue, automated tutor
              acquisition, more languages, multi-country expansion.
            </p>
          </div>
        </div>
      </Section>

      <Section title="The numbers we actually watch">
        <p>
          Not downloads. Not sign-ups. Not how many tutors registered. The metrics below are already derivable from
          the current schema, and they&rsquo;re the ones that describe whether the product is actually working:
        </p>
        <Table head={["Metric", "Definition"]} rows={metrics} />
      </Section>

      <Section title="North Star: completed, trusted learning sessions">
        <p>
          Already defined by the product&rsquo;s own design: a <Code>COMPLETED</Code>{" "}<Code>EduBooking</Code>{" "}
          paired with an <Code>ATTENDED</Code>{" "}<Code>EduSessionRecord</Code>{" "}— which is exactly why the attended
          session, not the payment alone, is what completes a booking. Not leads. Not proposals sent. Not accounts
          created. EduMatch earns its right to exist the moment a real student learns something with a real, trusted tutor, and that
          session actually happens.
        </p>
      </Section>

      {/* Close */}
      <div className="mt-20 border-t border-[var(--color-border)] pt-8">
        <h2 className="font-serif text-3xl text-[var(--color-text)]">The loop, in one picture</h2>
      </div>
      <Section>
        <div className="rounded-xl bg-[var(--color-primary)]/10 p-6 sm:p-8">
          <ol className="space-y-2">
            {[
              "Free AI help builds trust",
              "Trust leads into a smart intake",
              "The intake becomes a confirmed Learning Brief",
              "The Brief reaches up to five verified tutors",
              "The AI drafts a tutor-specific proposal",
              "The tutor approves and sends it — never the AI alone",
              "The student compares offers on equal footing",
              "The student books and pays through EduMatch checkout",
              "EduMatch earns a 15% fee (floor / cap to be validated)",
              "The session happens",
              "A verified review is left",
              "It joins a permanent learning journey",
              "Follow-up service leads to a repeat booking",
            ].map((step, i) => (
              <li key={step} className="flex items-baseline gap-3 text-sm text-[var(--color-text)]">
                <span className="w-5 shrink-0 font-mono text-xs text-[var(--color-primary)]">{String(i + 1).padStart(2, "0")}</span>
                {step}
              </li>
            ))}
          </ol>
          <p className="mt-4 border-t border-[var(--color-primary)]/20 pt-4 font-serif italic text-[var(--color-text)]">
            Every completed loop makes the next one a little better — for the next student, and the next tutor.
          </p>
        </div>
      </Section>

      <Section title="Appendix — screens to capture">
        <p>
          Live screenshots weren&rsquo;t captured automatically in this pass — no tool here can persist the sandboxed
          preview browser to a file, and grabbing the real desktop risked catching unrelated personal tabs, so that
          shortcut was deliberately skipped. The table below is the shot list to fill in from the running app at{" "}
          <Code>http://localhost:3009</Code>.
        </p>
        <Table head={["Page", "Route", "What it should show"]} rows={screens} />
        <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 px-4 py-3">
          <p className="m-0 text-[14px] text-[var(--color-text)]">
            The captured set now lives in its own gallery, one caption per screen.
          </p>
          <Link
            href="/admin/business-plan/screenshots"
            className="shrink-0 rounded-md bg-[var(--color-primary)] px-3.5 py-2 text-sm font-medium text-[#07101a] transition hover:opacity-90"
          >
            View captured screens →
          </Link>
        </div>
      </Section>

      <div className="mt-16 border-t border-[var(--color-border)] pt-6 text-xs text-[var(--color-text-muted)]">
        EduMatch Business Plan v1.0 · 12 August 2026 · ASafarIM Digital / Probex Belgium
      </div>
    </div>
  );
}

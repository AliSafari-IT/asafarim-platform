import type { Metadata } from "next";
import { ButtonLink, getPlatformLinks } from "@asafarim/ui";
import { getViewer } from "../lib/session";

export const metadata: Metadata = {
  title: "Overview",
};

const CAPABILITIES = [
  {
    tag: "M03",
    title: "Fast task experience, no AI required",
    body: "Projects, task hierarchy, dependencies, estimates, dates, labels, custom fields, recurrence, and templates — across Inbox, list, board, calendar, and timeline views.",
  },
  {
    tag: "M06–M07",
    title: "Proposal-only AI copilot",
    body: "Pasted notes and briefs become an editable work graph with source citations. Every AI change is a reviewable, undoable proposal — never an autonomous action.",
  },
  {
    tag: "M05 · M09",
    title: "Portable and integratable",
    body: "One versioned /api/v1 contract, CSV/JSON import-export, and — later — signed webhooks and a GitHub integration. No lock-in, ever.",
  },
];

const ROADMAP = [
  { id: "M03", label: "Task core", state: "next" },
  { id: "M05", label: "API + import/export", state: "planned" },
  { id: "M06–07", label: "AI proposals", state: "planned" },
  { id: "M09", label: "Webhooks + GitHub", state: "planned" },
];

const FOUNDATION = [
  {
    k: "Isolated database",
    v: "Its own PostgreSQL instance and credentials. Stores an opaque platform user id and nothing else about your identity.",
  },
  {
    k: "Shared sign-in",
    v: "Hub issues the session; TasksAI only reads it. No second password to manage or leak.",
  },
  {
    k: "Background worker",
    v: "A durable job model drains the outbox, delivers webhooks, and prunes rate counters out of the request path.",
  },
];

export default async function OverviewPage() {
  const viewer = await getViewer();
  const links = getPlatformLinks();
  const workspaceHref = viewer
    ? "/workspace"
    : `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/workspace`)}`;

  return (
    <main className="ta-home">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="ta-hero">
        <div className="ta-hero__copy">
          <p className="ta-kicker">From scattered intent to trusted execution</p>
          <h1 className="ta-hero__title">
            Work that a human <span className="ta-em">approves</span>, not one an
            AI <span className="ta-em ta-em--2">assumes</span>.
          </h1>
          <p className="ta-hero__lead">
            An AI-native work execution tool for delivery-focused teams of 5–50.
            It stays fast and useful with zero AI — and treats every AI change as
            a proposal you review and approve.
          </p>
          <div className="ta-hero__cta">
            <ButtonLink href={workspaceHref}>
              {viewer ? "Open workspace" : "Sign in to continue"}
            </ButtonLink>
            <a className="ta-ghostlink" href="/roadmap">
              See the roadmap →
            </a>
          </div>
          <p className="ta-hero__note" role="note">
            <strong>Early development.</strong> A deployable shell, not a launched
            product. Features below land milestone by milestone.
          </p>
        </div>

        {/* Scattered intent converging into an ordered plan. Decorative. */}
        <div className="ta-hero__art" aria-hidden="true">
          <svg viewBox="0 0 320 300" role="presentation">
            <defs>
              <linearGradient id="ta-edge" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="var(--accent)" />
                <stop offset="1" stopColor="var(--accent-2)" />
              </linearGradient>
            </defs>
            {/* edges of the resolved graph */}
            <g className="ta-art__edges" stroke="url(#ta-edge)" fill="none">
              <path d="M210 60 L250 130" />
              <path d="M210 60 L170 130" />
              <path d="M170 130 L200 210" />
              <path d="M250 130 L200 210" />
              <path d="M200 210 L215 270" />
            </g>
            {/* scattered fragments (left) that "settle" into nodes (right) */}
            <g className="ta-art__frags">
              <rect x="14" y="30" width="46" height="14" rx="4" />
              <rect x="40" y="86" width="60" height="14" rx="4" />
              <rect x="10" y="150" width="38" height="14" rx="4" />
              <rect x="52" y="210" width="54" height="14" rx="4" />
              <rect x="20" y="258" width="44" height="14" rx="4" />
            </g>
            <g className="ta-art__nodes">
              <circle cx="210" cy="60" r="13" />
              <circle cx="170" cy="130" r="11" />
              <circle cx="250" cy="130" r="11" />
              <circle cx="200" cy="210" r="12" />
              <circle cx="215" cy="270" r="9" className="ta-art__node--live" />
            </g>
          </svg>
        </div>
      </section>

      {/* ── The proposal contract ────────────────────────────────────── */}
      <section className="ta-contract">
        <div className="ta-contract__lead">
          <h2>Every AI edit arrives as a proposal</h2>
          <p>
            The copilot never writes to your plan directly. It drafts a diff you
            can edit, approve line by line, or discard — and undo after the fact.
          </p>
        </div>
        <figure className="ta-diffcard" aria-label="Example AI proposal">
          <figcaption>
            <span className="ta-badge ta-badge--2">AI proposal</span>
            <span className="ta-diffcard__src">from “kickoff-notes.md”</span>
          </figcaption>
          <ul className="ta-diffcard__rows">
            <li data-op="add">
              <span>+</span> Split “Launch billing” into 3 tasks with a blocked-by
              edge
            </li>
            <li data-op="add">
              <span>+</span> Add owner <em>@dana</em>, due <em>Fri</em>, estimate
              2d
            </li>
            <li data-op="edit">
              <span>~</span> Re-parent “Webhook retries” under “Reliability”
            </li>
          </ul>
          <div className="ta-diffcard__actions">
            <button type="button" className="ta-btn ta-btn--approve" disabled>
              Approve
            </button>
            <button type="button" className="ta-btn ta-btn--ghost" disabled>
              Discard
            </button>
            <span className="ta-diffcard__hint">preview — not interactive yet</span>
          </div>
        </figure>
      </section>

      {/* ── Capabilities ─────────────────────────────────────────────── */}
      <section className="ta-caps">
        <h2>What it will do</h2>
        <ol className="ta-caps__grid">
          {CAPABILITIES.map((c, i) => (
            <li key={c.title} className="ta-cap">
              <span className="ta-cap__no">{String(i + 1).padStart(2, "0")}</span>
              <span className="ta-badge">{c.tag}</span>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Roadmap rail ─────────────────────────────────────────────── */}
      <section className="ta-road" id="roadmap">
        <h2>Where it is going</h2>
        <ol className="ta-road__rail">
          {ROADMAP.map((m) => (
            <li key={m.id} data-state={m.state}>
              <span className="ta-road__dot" />
              <span className="ta-road__id">{m.id}</span>
              <span className="ta-road__label">{m.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ── How it is built ─────────────────────────────────────────── */}
      <section className="ta-built">
        <h2>How it is built</h2>
        <dl className="ta-built__list">
          {FOUNDATION.map((f) => (
            <div key={f.k}>
              <dt>{f.k}</dt>
              <dd>{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}

import type { Metadata } from "next";
import { ButtonLink, getPlatformLinks } from "@asafarim/ui";
import { getViewer } from "../lib/session";

export const metadata: Metadata = {
  title: "Overview",
};

const CAPABILITIES = [
  {
    title: "Fast task experience, no AI required",
    body: "Projects, task hierarchy, dependencies, estimates, dates, labels, custom fields, recurrence, templates — across Inbox, list, board, calendar, and timeline views. Planned for M03.",
  },
  {
    title: "Proposal-only AI copilot",
    body: "Pasted notes and briefs become an editable work graph with source citations. Every AI change is a reviewable, undoable proposal — never an autonomous action. Planned for M06–M07.",
  },
  {
    title: "Portable and integratable",
    body: "One versioned /api/v1 contract, CSV/JSON import-export, and (later) signed webhooks and a GitHub integration. No lock-in. Planned for M05, M09.",
  },
];

export default async function OverviewPage() {
  const viewer = await getViewer();
  const links = getPlatformLinks();
  const workspaceHref = viewer
    ? "/workspace"
    : `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/workspace`)}`;

  return (
    <main className="ta-prose">
      <p className="ta-kicker">From scattered intent to trusted execution</p>
      <h1>TasksAI</h1>
      <p className="ta-lead">
        An AI-native work execution tool for delivery-focused teams of 5–50. It stays fast and
        useful with zero AI, and treats every AI change as a proposal the human reviews and
        approves.
      </p>

      <div className="ta-callout" role="note">
        <strong>Early development.</strong> This is a deployable shell, not a launched product.
        No commercial service operates behind it. Features below are planned and land milestone
        by milestone — see the roadmap in the repository.
      </div>

      <ButtonLink href={workspaceHref}>
        {viewer ? "Open workspace" : "Sign in to continue"}
      </ButtonLink>

      <h2>What it will do</h2>
      <ul className="ta-cards">
        {CAPABILITIES.map((c) => (
          <li key={c.title}>
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </li>
        ))}
      </ul>

      <h2>How it is built</h2>
      <p>
        TasksAI runs on the ASafarIM platform&apos;s shared single sign-on and design system, with
        its <strong>own isolated PostgreSQL database</strong> and a background worker. It stores an
        opaque platform user id and nothing else about your identity.
      </p>
    </main>
  );
}

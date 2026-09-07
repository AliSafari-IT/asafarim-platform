import type { Metadata } from "next";
import { ButtonLink, getPlatformLinks } from "@asafarim/ui";
import { getViewer } from "../../lib/session";
import { UseCaseExplorer } from "./UseCaseExplorer";

export const metadata: Metadata = {
  title: "Use cases",
  description:
    "How teams use TasksAI: turning kickoff notes into an approved plan, sprint planning, daily focus, and keeping their data portable.",
};

export default async function UseCasesPage() {
  const viewer = await getViewer();
  const links = getPlatformLinks();
  const workspaceHref = viewer
    ? "/workspace"
    : `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/workspace`)}`;

  return (
    <main className="ta-home">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="ta-hero ta-hero--slim">
        <div className="ta-hero__copy">
          <p className="ta-kicker">Use cases</p>
          <h1 className="ta-hero__title">
            Four flows that turn intent into <span className="ta-em">shipped work</span>.
          </h1>
          <p className="ta-hero__lead">
            Each diagram is the actual shape of the workflow — where the AI
            proposes, where a human decides, and where your data can leave.
            Pick one to trace it end to end.
          </p>
          <div className="ta-hero__cta">
            <ButtonLink href={workspaceHref}>
              {viewer ? "Open workspace" : "Sign in to continue"}
            </ButtonLink>
          </div>
        </div>
      </section>

      {/* ── Interactive flow explorer ────────────────────────────────── */}
      <UseCaseExplorer />

      {/* ── The common thread ───────────────────────────────────────── */}
      <section className="ta-contract">
        <div className="ta-contract__lead">
          <h2>The common thread</h2>
          <p>
            Look at the four graphs together and the same rule holds: nothing
            reaches your plan without passing a human decision, and every
            outcome has an exit arrow. Proposal, approval, portability — in that
            order, every time.
          </p>
        </div>
        <figure className="ta-diffcard" aria-label="Use case flow summary">
          <figcaption>
            <span className="ta-badge ta-badge--2">Every use case</span>
            <span className="ta-diffcard__src">proposal → approval → portability</span>
          </figcaption>
          <ul className="ta-diffcard__rows">
            <li data-op="add">
              <span>+</span> AI drafts the change as a reviewable proposal
            </li>
            <li data-op="edit">
              <span>~</span> You edit, approve line by line, or discard
            </li>
            <li data-op="add">
              <span>+</span> Result stays exportable via API and CSV/JSON
            </li>
          </ul>
        </figure>
      </section>
    </main>
  );
}

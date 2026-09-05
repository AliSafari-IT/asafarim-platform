import Link from "next/link";
import { Alert, Badge, Card } from "@asafarim/ui";
import type { ShowcaseStatus } from "../../lib/ingestion/showcaseSource";

/**
 * The post-confirmation next step (issue #208).
 *
 * Before this, confirming a profile led nowhere: the candidate saw a
 * confirmation message and had to guess what came next. This panel names
 * the next action — search the demo jobs — and states plainly where those
 * postings come from, so nothing here reads as a live vacancy.
 */
export function NextStepPanel({ status }: { status: ShowcaseStatus }) {
  const sourceLine = !status.configured
    ? "No job source is loaded yet."
    : !status.synced
      ? "The demo source is configured but has not synced yet."
      : status.activePostings === 0
        ? "The demo source has synced, but no postings are active right now."
        : `${status.activePostings} demo posting${status.activePostings === 1 ? "" : "s"} ready to search.`;

  const canSearch = status.configured && status.synced && status.activePostings > 0;

  return (
    <Card title="Your profile is confirmed — here is what to do next">
      <ol className="jm-list">
        <li>
          <Badge tone="success">done</Badge> Profile confirmed. Matching and eligibility now run
          against this version.
        </li>
        <li>
          <Badge tone={canSearch ? "success" : "neutral"}>
            {canSearch ? "ready" : "waiting"}
          </Badge>{" "}
          Job source: {sourceLine}
        </li>
        <li>
          <Badge tone="neutral">next</Badge> Search the jobs, read the eligibility reasons on each
          result, and save the ones worth tracking.
        </li>
        <li>
          <Badge tone="neutral">then</Badge> Review what you saved on{" "}
          <Link href="/my-jobs" className="jm-mono">
            My Jobs
          </Link>{" "}
          and export it as CSV.
        </li>
      </ol>

      <Alert tone="info">
        The showcase runs on a{" "}
        <strong>synthetic demo source</strong>: the postings are fabricated for demonstration and
        are not real vacancies. Selecting a real, rights-cleared source is separate work — see{" "}
        <Link href="/sources" className="jm-mono">
          Sources
        </Link>
        .
      </Alert>

      <div style={{ marginTop: "1rem" }}>
        <Link href="/jobs" className="ui-btn ui-btn--primary ui-btn--sm">
          Go to Jobs →
        </Link>
      </div>
    </Card>
  );
}

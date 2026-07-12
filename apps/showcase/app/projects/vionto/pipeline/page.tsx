import type { Metadata } from "next";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import { ViontoNav } from "../_components/ViontoNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { PipelineExplorer } from "../_components/PipelineExplorer";

export const metadata: Metadata = {
  title: "Pipeline explorer — Vionto Studio",
  description:
    "Run the real Vionto Studio pipeline state machine in your browser: start a brief, approve or reject at each gate, trigger and retry a seeded failure — no network calls.",
};

export default function ViontoPipelinePage() {
  return (
    <>
      <PageHeader
        kicker="Pipeline"
        kickerIndex="05"
        title="Pipeline explorer"
        description="Runs the real state machine client-side against a committed synthetic brief. Approval gates cannot be skipped; retry is only possible from failed or cancelled — exactly the rules the engine enforces server-side in a real deployment."
      />

      <ViontoNav active="/projects/vionto/pipeline" />

      <FixtureBanner />

      <Section kicker="Live" kickerIndex="01" title="Step the pipeline yourself">
        <Panel title="pipeline explorer">
          <PipelineExplorer />
        </Panel>
      </Section>

      <Section kicker="Try this" kickerIndex="02" title="Three things worth clicking through">
        <div className="ui-grid">
          <Panel title="B-02 — seeded schema failure">
            <p>
              Start, then Approve. The asset plan fails schema validation on
              the first attempt — watch it land in <code>failed</code>, then
              hit Retry to see the regenerated plan pass and the run continue.
            </p>
          </Panel>
          <Panel title="B-03 — seeded transient render failure">
            <p>
              Start, Approve, Approve. The render stage fails once (a
              simulated transient encode error), then Retry succeeds without
              regenerating anything upstream.
            </p>
          </Panel>
          <Panel title="B-05 — reject with no retry">
            <p>
              Start, then Reject. The run ends at <code>cancelled</code> — a
              legitimate stop, not a failure, and nothing forces you to retry
              it.
            </p>
          </Panel>
        </div>
      </Section>
    </>
  );
}

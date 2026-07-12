import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import { ViontoNav } from "../_components/ViontoNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { methodology } from "../_data/benchmark";
import styles from "../_components/vionto.module.css";

export const metadata: Metadata = {
  title: "Case study — Vionto Studio",
  description:
    "From a personal AI video-story app to a transparent pipeline benchmark: architecture, tradeoffs, and lessons about building reliable AI workflows.",
};

const evolution = [
  {
    stage: "Personal project",
    stack: "Next.js · Prisma/Postgres · BullMQ/Redis · FFmpeg · OpenAI/Anthropic",
    idea: "Turn a brief into a rendered photo/video story: LLM script generation, a render-worker queue, subtitle burn-in, audio mixing.",
    limit:
      "The interesting engineering — a job state machine, idempotent retry, schema-validated manifests — was entangled with live provider calls, real media, and infrastructure that can't be shown publicly as-is.",
  },
  {
    stage: "This benchmark",
    stack: "Pure state machine · fixture providers · structured render reports · no live calls",
    idea: "Extract the orchestration discipline — approval gates, idempotent retry, seeded-failure recovery, cost estimation — and prove it deterministically, without a queue, a render farm, or a single API key.",
    limit:
      "Deliberately no live provider adapters, no real media encoding, no worker infrastructure. The public benchmark demonstrates reliability discipline, not content generation.",
  },
];

export default function ViontoCaseStudyPage() {
  return (
    <>
      <PageHeader
        kicker="Case study"
        kickerIndex="05"
        title="Building reliable AI workflows, not generating content"
        description="The part of Vionto worth showing publicly was never the video output — it was how the pipeline handles failure."
      />

      <ViontoNav active="/projects/vionto/case-study" />

      <FixtureBanner />

      <Section kicker="Evolution" kickerIndex="01" title="What was ported, what wasn't">
        <div style={{ overflowX: "auto" }}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Stage</th>
                <th>Stack</th>
                <th>Core idea</th>
                <th>Where it hit a wall</th>
              </tr>
            </thead>
            <tbody>
              {evolution.map((e) => (
                <tr key={e.stage}>
                  <td>
                    <strong>{e.stage}</strong>
                  </td>
                  <td className={styles.mono}>{e.stack}</td>
                  <td>{e.idea}</td>
                  <td className="u-muted">{e.limit}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section kicker="Architecture" kickerIndex="02" title="How the benchmark is built">
        <div className="ui-grid">
          <Panel title="Constraints before spend">
            <p>
              Every stage's output is schema-validated before the pipeline
              advances. A malformed asset plan is caught immediately — never
              silently passed to a render stage that would waste the expensive
              step.
            </p>
          </Panel>
          <Panel title="Explicit approval, not implicit trust">
            <p>
              The state machine will not proceed past script generation or
              asset planning without an explicit approve() call. A human can
              reject at either gate and the run ends cleanly at{" "}
              <code>cancelled</code> — never silently continuing with rejected
              output.
            </p>
          </Panel>
          <Panel title="Idempotent retry, not blind resubmission">
            <p>
              Retry is legal only from <code>failed</code> or{" "}
              <code>cancelled</code>, and always returns a new job rather than
              mutating history — the same rule the legacy render-job retry
              route enforced, generalized to every stage.
            </p>
          </Panel>
          <Panel title="One engine, three consumers">
            <p>
              The state machine, providers, and renderer are one ESM module
              imported by the Node test suite, the fixture generator, and the
              Showcase's client-side Pipeline Explorer — no second
              implementation to drift.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Tradeoffs" kickerIndex="03" title="What we gave up, and why">
        <div className="ui-grid">
          <Panel title="No live generation in public">
            <p>
              The public surface cannot call a real LLM or render worker. That
              rules out "generate my own video" demos, but it's the only way
              to publish a pipeline benchmark with zero API keys and zero cost
              risk.
            </p>
          </Panel>
          <Panel title="Structured reports, not real media">
            <p>
              The fixture renderer produces a JSON report and an SVG
              storyboard strip, not an actual encoded video — there is no
              media pipeline dependency in this benchmark, synthetic or
              otherwise.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Lessons" kickerIndex="04" title="Lessons from the legacy system">
        <div className="ui-grid">
          <Panel title="Reliability is a state machine, not a try/catch">
            <p>
              The legacy retry route got idempotency right in one place. Making
              it a first-class, tested state machine — rather than logic
              embedded in one API route — is what let this benchmark prove the
              rule holds for every stage, not just render.
            </p>
          </Panel>
          <Panel title="A cost estimate is only honest if it's falsifiable">
            <p>
              An estimate nobody checks against reality isn't a benchmark
              dimension, it's a guess. Recomputing "observed" cost from the
              actual artifacts — and reporting the delta as zero in fixture
              mode, honestly — sets up the exact comparison a live adapter
              would need to earn trust.
            </p>
          </Panel>
          <Panel title="Toward a real production version">
            <ul style={{ margin: "0.4rem 0 0", paddingLeft: "1.1rem" }}>
              {methodology.towardProduction.map((item) => (
                <li key={item} style={{ marginBottom: "0.3rem" }}>
                  {item}
                </li>
              ))}
            </ul>
            <Badge tone="info">evidence-first</Badge>
          </Panel>
        </div>
      </Section>
    </>
  );
}

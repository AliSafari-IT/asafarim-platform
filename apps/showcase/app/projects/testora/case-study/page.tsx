import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import { TestoraNav } from "../_components/TestoraNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import styles from "../_components/testora.module.css";

export const metadata: Metadata = {
  title: "Case study — Testora",
  description:
    "How Testora went from a TestCafe + .NET + SignalR console to a deterministic, read-only Playwright benchmark: architecture, tradeoffs, and lessons.",
};

const evolution = [
  {
    stage: "v1 — Test console",
    stack: "TestCafe · .NET API · SignalR · Vite/React",
    idea: "One-click E2E runs against real apps with live results streamed over SignalR.",
    limit:
      "Required a live backend and a running target; results were tied to a specific environment and hard to reproduce or publish safely.",
  },
  {
    stage: "v2 — Orchestrator rewrite",
    stack: "Next.js · Drizzle · custom test-engine",
    idea: "Model requirements → suites → fixtures → cases in a database; generate and run scenarios; render HTML/JSON reports.",
    limit:
      "Strong data model and reporting, but still execution-centric and stateful — not something you can expose publicly without a runner.",
  },
  {
    stage: "v3 — Public benchmark (this)",
    stack: "Playwright · offline sample app · committed fixtures · read-only demo",
    idea: "Invert the problem: fix the system under test, seed known defects, and measure detection deterministically. Ship the evidence, not a runner.",
    limit:
      "Deliberately cannot execute user code. Live/authenticated runs are out of scope for the public surface.",
  },
];

export default function TestoraCaseStudyPage() {
  return (
    <>
      <PageHeader
        kicker="Case study"
        kickerIndex="03"
        title="From a live test console to a deterministic benchmark"
        description="Three iterations of the same idea — the last one is the one you can trust in public."
      />

      <TestoraNav active="/projects/testora/case-study" />

      <FixtureBanner />

      <Section kicker="Evolution" kickerIndex="01" title="Three iterations">
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
                  <td className={styles.caseTitle}>{e.stage}</td>
                  <td className={styles.caseId}>{e.stack}</td>
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
          <Panel title="System under test">
            <p>
              A pure static app (<code>benchmarks/testora/sample-app</code>) with
              no network, storage, or timers. Every screen renders from the URL
              query alone, so a run is a pure function of its inputs.
            </p>
          </Panel>
          <Panel title="Seeded ground truth">
            <p>
              A catalog (<code>fixtures/scenarios.mjs</code>) declares each
              scenario's true kind — pass, seeded fail, or controlled flake — and
              the diagnosis a good suite should produce. It drives both the specs
              and the scoring.
            </p>
          </Panel>
          <Panel title="Deterministic execution">
            <p>
              Playwright runs single-worker with one retry. Seeded regressions
              fail on every attempt; the flake passes <code>testInfo.retry</code>{" "}
              as its attempt, so it fails first and passes on retry.
            </p>
          </Panel>
          <Panel title="Evidence, distilled">
            <p>
              A generator validates that live outcomes still match ground truth,
              then writes byte-stable fixture JSON. The public demo renders that
              snapshot; CI uploads the real traces as the citable source.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Tradeoffs" kickerIndex="03" title="What we gave up, and why">
        <div className="ui-grid">
          <Panel title="No live runner in public">
            <p>
              The public surface cannot execute arbitrary code. That closes the
              door on "run it against your app" demos, but it's the only honest
              way to publish results without a sandboxed backend.
            </p>
          </Panel>
          <Panel title="Distilled snapshot over raw logs">
            <p>
              Committed fixtures are a reproducible distillation, not a dump of
              every millisecond. Raw millisecond jitter is intentionally excluded
              so regeneration is byte-stable — the trade is less "liveness" for
              trustworthy determinism.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Lessons" kickerIndex="04" title="Lessons from the legacy system">
        <div className="ui-grid">
          <Panel title="Reproducibility beats realism">
            <p>
              The SignalR console felt impressive but its results couldn't be
              re-derived. Fixing the SUT and seeding defects made the benchmark
              something you can actually reason about.
            </p>
          </Panel>
          <Panel title="Detection is the real metric">
            <p>
              Counting green tests flatters a suite. Measuring how many{" "}
              <em>known</em> defects it catches, and whether it can tell a flake
              from a regression, is what maps to engineering value.
            </p>
          </Panel>
          <Panel title="Claims need a citation">
            <p>
              Any headline about reduced manual-testing effort is only stated
              where the supporting source can be cited — the runnable harness and
              CI in <code>benchmarks/testora</code> — never as an unbacked number.{" "}
              <Badge tone="info">evidence-first</Badge>
            </p>
          </Panel>
        </div>
      </Section>
    </>
  );
}

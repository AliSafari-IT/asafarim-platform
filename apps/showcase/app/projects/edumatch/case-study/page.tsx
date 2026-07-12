import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import { EdumatchNav } from "../_components/EdumatchNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { methodology } from "../_data/benchmark";
import styles from "../_components/edumatch.module.css";

export const metadata: Metadata = {
  title: "Case study — EduMatch",
  description:
    "From a marketplace app to a focused, explainable matching benchmark: architecture, tradeoffs, and lessons.",
};

const evolution = [
  {
    stage: "Personal project",
    stack: "Next.js · Prisma/Postgres · Stripe Connect · geocoding",
    idea: "A full tutoring marketplace: intake, tutor discovery, quotes, Stripe-split payments, disputes, verification, notifications.",
    limit:
      "The matching algorithm itself — the actual product insight — was buried inside a large, credentialed, stateful app that can't be shown publicly as-is.",
  },
  {
    stage: "This benchmark",
    stack: "Pure JS engine · synthetic fixtures · client-side demo",
    idea: "Extract just the matching logic, make it explainable and adjustable, and prove it with deterministic tests instead of a live marketplace.",
    limit:
      "Deliberately no accounts, payments, geocoding, or verification — the Journey page simulates the workflow shape without any of the real infrastructure.",
  },
];

export default function EdumatchCaseStudyPage() {
  return (
    <>
      <PageHeader
        kicker="Case study"
        kickerIndex="04"
        title="From a tutoring marketplace to an explainable matching benchmark"
        description="The insight worth keeping was never the payments stack — it was how the ranking is built and explained."
      />

      <EdumatchNav active="/projects/edumatch/case-study" />

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
          <Panel title="Constraints first, scoring second">
            <p>
              Hard requirements (subject, level, language, availability, mode/distance) are
              checked before any scoring happens. A tutor who fails one is never ranked — and the
              reason is recorded, not discarded.
            </p>
          </Panel>
          <Panel title="Explainable by construction">
            <p>
              Every ranked result carries a factor-by-factor breakdown (value × weight =
              contribution) that sums exactly to its composite score — there is no hidden step
              between "why" and "what."
            </p>
          </Panel>
          <Panel title="One engine, two consumers">
            <p>
              The engine is a single ESM module imported by the Node test suite, the fixture
              generator, and the Showcase's client-side Match Explorer — there is no second
              implementation to drift out of sync.
            </p>
          </Panel>
          <Panel title="Damped rating">
            <p>
              The legacy algorithm normalised rating as <code>avg / 5</code>, which let a single
              five-star review outrank a tutor with forty consistently strong ones. This version
              damps toward a neutral prior so review count matters.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Tradeoffs" kickerIndex="03" title="What we gave up, and why">
        <div className="ui-grid">
          <Panel title="No live marketplace in public">
            <p>
              The public surface cannot create a real booking or move real money. That rules out
              "try it against real tutors" demos, but it's the only honest way to publish a
              matching demo without a moderated, credentialed backend.
            </p>
          </Panel>
          <Panel title="Small, hand-reviewed fixture set">
            <p>
              Twelve tutors and six needs are enough to demonstrate the method precisely — a
              deliberate twin pair, a tight-availability case, a no-qualified-tutor case — but they
              are not a statistically representative population.
            </p>
          </Panel>
        </div>
      </Section>

      <Section kicker="Lessons" kickerIndex="04" title="Lessons from the legacy system">
        <div className="ui-grid">
          <Panel title="Explainability is a design decision, not a feature">
            <p>
              The legacy scorer produced a single number. Retrofitting an explanation after the
              fact is much harder than building the factor breakdown as the primary output from
              day one, which is what this version does.
            </p>
          </Panel>
          <Panel title="Fairness needs a provable test, not a policy statement">
            <p>
              Saying "the algorithm doesn't use protected attributes" is a claim. A
              constraint-identical twin pair that must score identically is a test. See the{" "}
              <a href="/projects/edumatch/fairness">Fairness page</a>.
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

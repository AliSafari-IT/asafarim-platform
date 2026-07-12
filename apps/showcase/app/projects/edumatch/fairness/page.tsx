import type { Metadata } from "next";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import { EdumatchNav } from "../_components/EdumatchNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { matchResults, benchmarkScores } from "../_data/benchmark";
import styles from "../_components/edumatch.module.css";

export const metadata: Metadata = {
  title: "Fairness — EduMatch",
  description:
    "How EduMatch tests fairness with a constraint-identical twin pair, and an edge-case analysis of what happens when no tutor qualifies.",
};

const TWIN_A = "T-01";
const TWIN_B = "T-04";

export default function EdumatchFairnessPage() {
  const twinRows = matchResults
    .map((m) => {
      const a = m.ranked.find((r) => r.tutorId === TWIN_A);
      const b = m.ranked.find((r) => r.tutorId === TWIN_B);
      return { needId: m.needId, label: m.label, a, b };
    })
    .filter((row) => row.a || row.b);

  const noMatchNeed = matchResults.find((m) => m.ranked.length === 0);

  return (
    <>
      <PageHeader
        kicker="Fairness"
        kickerIndex="04"
        title="A twin pair, and an edge case with no answer"
        description="Fairness here means the engine is provably blind to an attribute it was never given. The no-qualified-tutor case shows the engine can say 'nobody' instead of forcing a bad match."
      />

      <EdumatchNav active="/projects/edumatch/fairness" />

      <FixtureBanner />

      <Section kicker="Method" kickerIndex="01" title="The constraint-identical twin pair">
        <Panel title={`${TWIN_A} · ${TWIN_B} — identical qualifications, different cohort tag`}>
          <p>
            Tutors <code>{TWIN_A}</code> and <code>{TWIN_B}</code> are fixture-designed to be
            identical on every matching attribute (subjects, levels, languages, modes,
            availability, location, rating, verification) and differ only in a neutral{" "}
            <code>cohort</code> tag the engine never reads. Any score difference between them
            would mean the engine is reacting to something outside its declared factors.
          </p>
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Need</th>
                  <th>{TWIN_A} composite</th>
                  <th>{TWIN_B} composite</th>
                  <th>Delta</th>
                </tr>
              </thead>
              <tbody>
                {twinRows.map((row) => (
                  <tr key={row.needId}>
                    <td>
                      <div>{row.label}</div>
                      <div className={styles.mono}>{row.needId}</div>
                    </td>
                    <td className={styles.num}>{row.a ? row.a.composite.toFixed(3) : "excluded"}</td>
                    <td className={styles.num}>{row.b ? row.b.composite.toFixed(3) : "excluded"}</td>
                    <td className={styles.num}>
                      {row.a && row.b ? (
                        <Badge tone={row.a.composite === row.b.composite ? "success" : "danger"}>
                          {Math.abs(row.a.composite - row.b.composite).toFixed(3)}
                        </Badge>
                      ) : (
                        <span className="u-muted">both excluded together</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="u-muted" style={{ marginTop: "0.6rem" }}>
            Measured maximum delta across every need: {benchmarkScores.dimensions.fairness.value.toFixed(3)}.
          </p>
        </Panel>
      </Section>

      {noMatchNeed ? (
        <Section kicker="Edge case" kickerIndex="02" title="When nobody qualifies">
          <Panel title={`${noMatchNeed.needId} — ${noMatchNeed.label}`}>
            <p>
              No fixture tutor teaches <strong>{noMatchNeed.subject}</strong>. Every one of the{" "}
              {noMatchNeed.excluded.length} tutors is excluded on the subject constraint, and the
              engine returns an empty ranked list rather than relaxing a requirement to force a
              result. Showing "no match" honestly is part of what constraint satisfaction means
              here.
            </p>
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Tutor</th>
                    <th>Excluded because</th>
                  </tr>
                </thead>
                <tbody>
                  {noMatchNeed.excluded.slice(0, 6).map((e) => (
                    <tr key={e.tutorId}>
                      <td>{e.name}</td>
                      <td>{e.reasons.map((r) => r.detail).join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </Section>
      ) : null}
    </>
  );
}

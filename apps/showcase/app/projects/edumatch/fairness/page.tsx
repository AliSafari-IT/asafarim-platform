import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Badge, PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
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
const COHORT = "cohort";

export default async function EdumatchFairnessPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
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
        kicker={t("showcase.edumatch.fairness.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.fairness.pageHeader.title")}
        description={t("showcase.edumatch.fairness.pageHeader.description")}
      />

      <EdumatchNav active="/projects/edumatch/fairness" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.edumatch.fairness.section.method.kicker")}
        kickerIndex="01"
        title={t("showcase.edumatch.fairness.section.method.title")}
      >
        <Panel
          title={t("showcase.edumatch.fairness.panel.title")
            .replace("{twinA}", TWIN_A)
            .replace("{twinB}", TWIN_B)}
        >
          <p>
            {t("showcase.edumatch.fairness.method.intro")
              .replace("{twinA}", TWIN_A)
              .replace("{twinB}", TWIN_B)
              .replace("{cohort}", COHORT)}
          </p>
          <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>{t("showcase.edumatch.fairness.table.need")}</th>
                  <th>{t("showcase.edumatch.fairness.table.twinA").replace("{twinA}", TWIN_A)}</th>
                  <th>{t("showcase.edumatch.fairness.table.twinB").replace("{twinB}", TWIN_B)}</th>
                  <th>{t("showcase.edumatch.fairness.table.delta")}</th>
                </tr>
              </thead>
              <tbody>
                {twinRows.map((row) => (
                  <tr key={row.needId}>
                    <td>
                      <div>{row.label}</div>
                      <div className={styles.mono}>{row.needId}</div>
                    </td>
                    <td className={styles.num}>{row.a ? row.a.composite.toFixed(3) : t("showcase.edumatch.fairness.table.excluded")}</td>
                    <td className={styles.num}>{row.b ? row.b.composite.toFixed(3) : t("showcase.edumatch.fairness.table.excluded")}</td>
                    <td className={styles.num}>
                      {row.a && row.b ? (
                        <Badge tone={row.a.composite === row.b.composite ? "success" : "danger"}>
                          {Math.abs(row.a.composite - row.b.composite).toFixed(3)}
                        </Badge>
                      ) : (
                        <span className="u-muted">{t("showcase.edumatch.fairness.table.bothExcluded")}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="u-muted" style={{ marginTop: "0.6rem" }}>
            {t("showcase.edumatch.fairness.maxDelta")
              .replace("{value}", benchmarkScores.dimensions.fairness.value.toFixed(3))}
          </p>
        </Panel>
      </Section>

      {noMatchNeed ? (
        <Section
          kicker={t("showcase.edumatch.fairness.section.edge.kicker")}
          kickerIndex="02"
          title={t("showcase.edumatch.fairness.section.edge.title")}
        >
          <Panel title={`${noMatchNeed.needId} — ${noMatchNeed.label}`}>
            <p>
              {t("showcase.edumatch.fairness.edge.body")
                .replace("{subject}", noMatchNeed.subject)
                .replace("{count}", String(noMatchNeed.excluded.length))}
            </p>
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>{t("showcase.edumatch.fairness.edge.table.tutor")}</th>
                    <th>{t("showcase.edumatch.fairness.edge.table.excludedBecause")}</th>
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

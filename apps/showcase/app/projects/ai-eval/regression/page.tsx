import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { AiEvalNav } from "../_components/AiEvalNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { RegressionDiff } from "../_components/RegressionDiff";
import { regression } from "../_data/benchmark";
import styles from "../_components/ai-eval.module.css";

export const metadata: Metadata = {
  title: "Regression — AI Evaluation Lab",
  description:
    "A documented failed regression: a stricter prompt revision breaks format compliance for the compact model on tool selection.",
};

export default async function AiEvalRegressionPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const regressed = regression.rows.filter((r) => r.regressed);
  return (
    <>
      <PageHeader
        kicker={t("showcase.aiEval.regression.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.aiEval.regression.pageHeader.title")}
        description={`${regression.label} · ${regression.scenario} · prompt ${regression.promptFrom} → ${regression.promptTo}`}
      />

      <AiEvalNav active="/projects/ai-eval/regression" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.aiEval.regression.whatHappened.kicker")}
        kickerIndex="01"
        title={t("showcase.aiEval.regression.whatHappened.title")}
      >
        <p style={{ maxWidth: "48rem" }}>
          Revising the tool-selection prompt from <code>v1</code> to a stricter{" "}
          <code>v2</code> (&ldquo;arguments only, no prose&rdquo;) helped the
          larger models but pushed <strong>{regression.label}</strong> to emit an
          enum-invalid argument on <code>{regressed[0]?.caseId}</code> — dropping
          that case from passing to failing on format compliance. This is exactly
          the kind of change a prompt-level regression test must catch.
        </p>
        <div className="ui-grid">
          <Panel title={t("showcase.aiEval.regression.promptV1")}>
            <pre className={styles.code}>{`# system\n${regression.promptDiff.v1.system}\n\n# instruction\n${regression.promptDiff.v1.instruction}`}</pre>
          </Panel>
          <Panel title={t("showcase.aiEval.regression.promptV2Regressed")}>
            <pre className={styles.code}>{`# system\n${regression.promptDiff.v2.system}\n\n# instruction\n${regression.promptDiff.v2.instruction}`}</pre>
          </Panel>
        </div>
      </Section>

      <Section
        kicker={t("showcase.aiEval.regression.caseByCase.kicker")}
        kickerIndex="02"
        title={t("showcase.aiEval.regression.caseByCase.title")}
      >
        <RegressionDiff regression={regression} />
      </Section>
    </>
  );
}

import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { ViontoNav } from "../_components/ViontoNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { PipelineExplorer } from "../_components/PipelineExplorer";

export const metadata: Metadata = {
  title: "Pipeline explorer — Vionto Studio",
  description:
    "Run the real Vionto Studio pipeline state machine in your browser: start a brief, approve or reject at each gate, trigger and retry a seeded failure — no network calls.",
};

export default async function ViontoPipelinePage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  return (
    <>
      <PageHeader
        kicker={t("showcase.vionto.pipeline.pageHeader.kicker")}
        kickerIndex="05"
        title={t("showcase.vionto.pipeline.pageHeader.title")}
        description={t("showcase.vionto.pipeline.pageHeader.description")}
      />

      <ViontoNav active="/projects/vionto/pipeline" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.vionto.pipeline.section.live.kicker")}
        kickerIndex="01"
        title={t("showcase.vionto.pipeline.section.live.title")}
      >
        <Panel title={t("showcase.vionto.pipeline.panel.title")}>
          <PipelineExplorer />
        </Panel>
      </Section>

      <Section
        kicker={t("showcase.vionto.pipeline.section.try.kicker")}
        kickerIndex="02"
        title={t("showcase.vionto.pipeline.section.try.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.vionto.pipeline.try.b02.title")}>
            <p>{t("showcase.vionto.pipeline.try.b02.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.pipeline.try.b03.title")}>
            <p>{t("showcase.vionto.pipeline.try.b03.body")}</p>
          </Panel>
          <Panel title={t("showcase.vionto.pipeline.try.b05.title")}>
            <p>{t("showcase.vionto.pipeline.try.b05.body")}</p>
          </Panel>
        </div>
      </Section>
    </>
  );
}

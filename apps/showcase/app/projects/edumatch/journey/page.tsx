import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, Panel, Section } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../../lib/i18n-dictionaries";
import { EdumatchNav } from "../_components/EdumatchNav";
import { FixtureBanner } from "../_components/FixtureBanner";
import { JourneySim } from "../_components/JourneySim";

export const metadata: Metadata = {
  title: "Journey — EduMatch",
  description:
    "The inquiry -> proposal -> booking journey across student, tutor, and moderator perspectives, in a safe demo mode with no external side effects.",
};

export default async function EdumatchJourneyPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  return (
    <>
      <PageHeader
        kicker={t("showcase.edumatch.journey.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.journey.pageHeader.title")}
        description={t("showcase.edumatch.journey.pageHeader.description")}
      />

      <EdumatchNav active="/projects/edumatch/journey" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.edumatch.journey.section.demo.kicker")}
        kickerIndex="01"
        title={t("showcase.edumatch.journey.section.demo.title")}
      >
        <Panel title={t("showcase.edumatch.journey.panel.demo")}>
          <JourneySim />
        </Panel>
      </Section>

      <Section
        kicker={t("showcase.edumatch.journey.section.why.kicker")}
        kickerIndex="02"
        title={t("showcase.edumatch.journey.section.why.title")}
      >
        <div className="ui-grid">
          <Panel title={t("showcase.edumatch.journey.student.title")}>
            <p>{t("showcase.edumatch.journey.student.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.journey.tutor.title")}>
            <p>{t("showcase.edumatch.journey.tutor.body")}</p>
          </Panel>
          <Panel title={t("showcase.edumatch.journey.moderator.title")}>
            <p>{t("showcase.edumatch.journey.moderator.body")}</p>
          </Panel>
        </div>
      </Section>
    </>
  );
}

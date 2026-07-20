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
import { MatchExplorer } from "../_components/MatchExplorer";

export const metadata: Metadata = {
  title: "Match explorer — EduMatch",
  description:
    "Inspect and adjust the EduMatch matching factors live: pick a student need, see the ranked tutors with a full factor breakdown, and move the weights yourself.",
};

export default async function EdumatchExplorerPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  return (
    <>
      <PageHeader
        kicker={t("showcase.edumatch.explorer.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.edumatch.explorer.pageHeader.title")}
        description={t("showcase.edumatch.explorer.pageHeader.description")}
      />

      <EdumatchNav active="/projects/edumatch/explorer" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.edumatch.explorer.section.kicker")}
        kickerIndex="01"
        title={t("showcase.edumatch.explorer.section.title")}
      >
        <Panel title={t("showcase.edumatch.explorer.panelTitle")}>
          <MatchExplorer />
        </Panel>
      </Section>
    </>
  );
}

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
import { Leaderboard } from "../_components/Leaderboard";
import { leaderboard } from "../_data/benchmark";

export const metadata: Metadata = {
  title: "Leaderboard — AI Evaluation Lab",
  description:
    "Provider-neutral model aliases ranked by overall score across correctness, groundedness, format compliance, and safety, with latency and estimated cost.",
};

export default async function AiEvalLeaderboardPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  return (
    <>
      <PageHeader
        kicker={t("showcase.aiEval.leaderboard.pageHeader.kicker")}
        kickerIndex="04"
        title={t("showcase.aiEval.leaderboard.pageHeader.title")}
        description={`Ranked over checked-in fixture results · prompt ${leaderboard.version} · ${leaderboard.models[0].cases} cases per model.`}
      />

      <AiEvalNav active="/projects/ai-eval/leaderboard" />

      <FixtureBanner />

      <Section
        kicker={t("showcase.aiEval.leaderboard.section.kicker")}
        kickerIndex="01"
        title={t("showcase.aiEval.leaderboard.section.title")}
      >
        <Panel title={t("showcase.aiEval.leaderboard.panelTitle")}>
          <Leaderboard rows={leaderboard.models} />
        </Panel>
        <p className="u-muted" style={{ marginTop: "var(--space-4)", maxWidth: "44rem" }}>
          {t("showcase.aiEval.leaderboard.note")}
        </p>
      </Section>
    </>
  );
}

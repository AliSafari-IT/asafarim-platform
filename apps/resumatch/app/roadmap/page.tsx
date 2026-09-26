import type { Metadata } from "next";
import { Roadmap, type RoadmapItem } from "@asafarim/ui";
import { getTranslator } from "../../lib/i18n-server";
import { roadmapMilestones } from "./data";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.nav.roadmap") };
}

export default async function RoadmapPage() {
  const { t } = await getTranslator();
  const items: RoadmapItem[] = roadmapMilestones.map(({ timeframe, ...milestone }) => ({
    ...milestone,
    title: t(`resumatch.roadmap.${milestone.id}.title`),
    summary: t(`resumatch.roadmap.${milestone.id}.summary`),
    ...(timeframe ? { timeframe: t(`resumatch.roadmap.timeframe.${timeframe}`) } : {}),
  }));

  return (
    <main className="jm-roadmap-page">
      <Roadmap
        kicker={t("resumatch.roadmap.kicker")}
        title={t("resumatch.roadmap.title")}
        description={t("resumatch.roadmap.description")}
        items={items}
        labels={{
          history: t("resumatch.roadmap.history"),
          roadmap: t("resumatch.roadmap.roadmap"),
          all: t("resumatch.roadmap.all"),
          changelogTitle: t("resumatch.roadmap.changelogTitle"),
          changelogSubtitle: t("resumatch.roadmap.changelogSubtitle"),
          roadmapTitle: t("resumatch.roadmap.roadmapTitle"),
          roadmapSubtitle: t("resumatch.roadmap.roadmapSubtitle"),
          status: {
            shipped: t("resumatch.roadmap.status.shipped"),
            "in-progress": t("resumatch.roadmap.status.in-progress"),
            planned: t("resumatch.roadmap.status.planned"),
            exploring: t("resumatch.roadmap.status.exploring"),
          },
        }}
      />
    </main>
  );
}

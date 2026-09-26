import type { Metadata } from "next";
import Link from "next/link";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../lib/db/client";
import { getTranslator } from "../../../lib/i18n-server";
import { getJourneyCounts, jobKey } from "../../../lib/journey";
import { getCurrentWorkspace } from "../../../lib/workspace";
import { BarList } from "../../components/app/Charts";
import { JourneyTracker } from "../../components/app/JourneyTracker";
import { PageHero } from "../../components/app/PageHero";
import { StatRow, StatTile } from "../../components/app/Stats";
import { BriefcaseIcon, MailIcon, SparkIcon, WarningIcon } from "../../profile/icons";
import { HistoryList } from "./HistoryList";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.history.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * List view for issue #434: every `TailoredResume` row for the workspace,
 * newest first, with the target job, `templateKey`, `degraded` flag, and
 * prompt/model provenance. All the data already exists (see
 * generate-confirm's write) — this is read-only UI plus a picker for the
 * compare page.
 */
export default async function TailoringHistoryPage() {
  const { t } = await getTranslator();
  const workspace = await getCurrentWorkspace();
  if (!workspace) {
    return (
      <>
        <PageHeader kicker={t("resumatch.inactive.kicker")} title={t("resumatch.inactive.title")} />
        <Alert tone="warning">
          <strong>{t("resumatch.inactive.strong")}</strong> {t("resumatch.inactive.body")}
        </Alert>
      </>
    );
  }

  const db = getJobmatchDb();
  const [resumes, journey] = await Promise.all([
    db.tailoredResume.findMany({
      where: { workspaceId: workspace.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        templateKey: true,
        degraded: true,
        outputLanguage: true,
        promptVersion: true,
        modelVersion: true,
        profileVersionId: true,
        targetJobId: true,
        targetJob: {
          select: { id: true, title: true, employer: true, sourceUrl: true },
        },
        coverLetter: { select: { id: true, outputLanguage: true } },
      },
    }),
    getJourneyCounts(workspace.id),
  ]);

  // Most-tailored jobs: versions per distinct job (see jobKey), top six.
  const perJob = new Map<string, { label: string; hint?: string; count: number }>();
  for (const r of resumes) {
    const key = jobKey(r.targetJob);
    const entry = perJob.get(key) ?? {
      label: r.targetJob.title ?? r.targetJob.employer ?? t("resumatch.untitledJob"),
      hint: r.targetJob.title && r.targetJob.employer ? r.targetJob.employer : undefined,
      count: 0,
    };
    entry.count += 1;
    perJob.set(key, entry);
  }
  const topJobs = [...perJob.values()].sort((a, b) => b.count - a.count).slice(0, 6);
  const withCoverLetter = resumes.filter((r) => r.coverLetter).length;
  const degraded = resumes.filter((r) => r.degraded).length;

  return (
    <div className="rx">
      <PageHero
        kicker={t("resumatch.history.kicker")}
        title={t("resumatch.history.title")}
        accent={t("resumatch.history.accent")}
        lead={t("resumatch.history.lead")}
        aside={<JourneyTracker counts={journey} current="tailor" />}
      />

      {resumes.length === 0 ? (
        <section className="rx-panel rx-panel--warm">
          <h2 className="rx-panel__title">{t("resumatch.history.empty.title")}</h2>
          <p className="rx-panel__sub">{t("resumatch.history.empty.body")}</p>
          <Link href="/tailor" className="rx-btn rx-btn--primary">
            {t("resumatch.history.empty.cta")}
          </Link>
        </section>
      ) : (
        <>
          <StatRow label={t("resumatch.history.stats.aria")}>
            <StatTile value={resumes.length} label={t("resumatch.history.stats.versions")} visual={<SparkIcon />} />
            <StatTile value={perJob.size} label={t("resumatch.history.stats.jobs")} visual={<BriefcaseIcon />} />
            <StatTile
              value={withCoverLetter}
              label={t("resumatch.history.stats.withCoverLetter")}
              visual={<MailIcon />}
              tone="ok"
            />
            <StatTile
              value={degraded}
              label={t("resumatch.history.stats.degraded")}
              hint={t("resumatch.history.stats.degradedHint")}
              visual={<WarningIcon />}
              tone={degraded > 0 ? "warm" : "muted"}
            />
          </StatRow>

          {topJobs.length > 1 ? (
            <section className="rx-panel">
              <h2 className="rx-panel__title">{t("resumatch.history.topJobs.title")}</h2>
              <p className="rx-panel__sub">{t("resumatch.history.topJobs.sub")}</p>
              <BarList items={topJobs} label={t("resumatch.history.topJobs.aria")} />
            </section>
          ) : null}

          <HistoryList resumes={resumes} />
        </>
      )}
    </div>
  );
}

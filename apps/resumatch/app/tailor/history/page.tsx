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
import { REPLY_EVENT_KINDS, summarizeOutcomes } from "../../../lib/history/outcomes";
import { HistoryList } from "./HistoryList";
import { OutcomesPanel } from "./OutcomesPanel";

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
 * compare page. Since 0.7.2 it also reads the tracked applications
 * and shows what happened to each job: lib/history/outcomes.ts.
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
  const [resumes, applications, journey] = await Promise.all([
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
          select: { id: true, title: true, employer: true, sourceUrl: true, sourceFiles: true },
        },
        coverLetter: { select: { id: true, outputLanguage: true } },
      },
    }),
    // Every tracked application, to say what happened to each job (0.7.2).
    db.application.findMany({
      where: { workspaceId: workspace.id },
      select: {
        id: true,
        status: true,
        targetJobId: true,
        tailoredResumeId: true,
        appliedAt: true,
        appliedTimeZone: true,
        updatedAt: true,
        targetJob: { select: { id: true, title: true, employer: true } },
        // Any logged answer counts, even with the status left on Applied.
        events: { where: { kind: { in: [...REPLY_EVENT_KINDS] } }, select: { id: true }, take: 1 },
      },
    }),
    getJourneyCounts(workspace.id),
  ]);
  const outcomes = summarizeOutcomes(
    resumes,
    applications.map(({ events, ...a }) => ({ ...a, replied: events.length > 0 })),
  );
  // Plain object: the client list can't take a Map across the boundary.
  const versionOutcomes = Object.fromEntries(
    [...outcomes.versionOutcomes].map(([id, o]) => [id, { applicationId: o.applicationId, status: o.status, via: o.via }]),
  );

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
            <StatTile value={perJob.size} label={t("resumatch.stats.jobs")} visual={<BriefcaseIcon />} />
            <StatTile
              value={withCoverLetter}
              label={t("resumatch.stats.withCoverLetter")}
              visual={<MailIcon />}
              tone="ok"
            />
            <StatTile
              value={degraded}
              label={t("resumatch.stats.degraded")}
              hint={t("resumatch.stats.degradedHint")}
              visual={<WarningIcon />}
              tone={degraded > 0 ? "warm" : "muted"}
            />
          </StatRow>

          <OutcomesPanel summary={outcomes} />

          {topJobs.length > 1 ? (
            <section className="rx-panel">
              <h2 className="rx-panel__title">{t("resumatch.history.topJobs.title")}</h2>
              <p className="rx-panel__sub">{t("resumatch.history.topJobs.sub")}</p>
              <BarList items={topJobs} label={t("resumatch.history.topJobs.aria")} />
            </section>
          ) : null}

          <HistoryList resumes={resumes} outcomes={versionOutcomes} />
        </>
      )}
    </div>
  );
}

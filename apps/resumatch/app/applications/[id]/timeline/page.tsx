import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { loadTimeline } from "../../../../lib/applications/timeline/service";
import { getTranslator } from "../../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { Timeline } from "../../../../components/applicationTimeline/Timeline";
import { SubmissionSummary } from "../../../../components/applicationTimeline/SubmissionSummary";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.tl.metaTitle") };
}
export const dynamic = "force-dynamic";

/** The full history of one application (application-timeline.md). Only
 *  the owning workspace can open it; any other id is a 404. */
export default async function TimelinePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  const data = await loadTimeline(workspace.id, id);
  if (!data) notFound();
  const { t } = await getTranslator();

  const job = [data.application.jobTitle, data.application.employer].filter(Boolean).join(" · ");
  const flash = query.recorded ? "recorded" : query.edited ? "edited" : query.undone ? "undone" : null;
  return (
    <>
      <PageHeader kicker={t("resumatch.tl.kicker")} title={job || t("resumatch.untitledJob")} description={t("resumatch.tl.description")} />
      {flash ? (
        <div data-testid="timeline-flash">
          <Alert tone="info">{t(`resumatch.tl.flash.${flash}`)}</Alert>
        </div>
      ) : null}
      <p className="rm-sent-nav">
        <a href="/applications">{t("resumatch.tl.back")}</a>
      </p>
      <SubmissionSummary application={data.application} />
      <Timeline applicationId={data.application.id} status={data.application.status} entries={data.entries} openAdd={query.add === "1"} />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@asafarim/ui";
import { prefillApplicationUrl } from "../../../../lib/applications/timeline/contract";
import { loadSubmissionForm } from "../../../../lib/applications/timeline/service";
import type { ApplicationStatusName } from "../../../../lib/applications/constants";
import { getTranslator } from "../../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { ExternalSubmissionForm } from "../../../../components/applicationTimeline/ExternalSubmissionForm";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.tl.ext.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * Record (or edit) an application made outside ResuMatch
 * (application-timeline.md). Opening this page, or the application link on
 * it, never changes the application: only Save does.
 */
export default async function ExternalSubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  const app = await loadSubmissionForm(workspace.id, id);
  if (!app) notFound();
  const { t } = await getTranslator();

  const mode = app.submissionChannel ? "edit" : "record";
  const job = [app.targetJob.title, app.targetJob.employer].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader
        kicker={t("resumatch.tl.kicker")}
        title={mode === "edit" ? t("resumatch.tl.ext.editTitle") : t("resumatch.tl.ext.title")}
        description={job ? t("resumatch.tl.ext.description", { job }) : undefined}
      />
      <ExternalSubmissionForm
        applicationId={app.id}
        mode={mode}
        status={app.status as ApplicationStatusName}
        hasAcceptedEmail={app._count.sentEmails > 0}
        prefillUrl={prefillApplicationUrl(app.targetJob.sourceUrl)}
        initial={{
          appliedAt: mode === "edit" ? (app.appliedAt?.toISOString() ?? null) : null,
          timeZone: mode === "edit" ? app.appliedTimeZone : null,
          channel: app.submissionChannel,
          channelLabel: app.submissionChannelLabel,
          applicationUrl: app.applicationUrl,
          reference: app.submissionReference,
          notes: app.events[0]?.summary ?? null,
        }}
      />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageHeader } from "@asafarim/ui";
import { getApplicationEmailConfig, senderDisplayName } from "../../../../lib/applicationEmail/config";
import { loadComposer } from "../../../../lib/applicationEmail/service";
import { describePdfStatus } from "../../../../lib/documentPdfs/describe";
import { pdfRendererConfigured } from "../../../../lib/documentPdfs/render";
import { getTranslator } from "../../../../lib/i18n-server";
import { getCurrentWorkspace, getSessionAccountInfo } from "../../../../lib/workspace";
import { Composer, type ComposerProps } from "./Composer";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.send.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * The application email composer (send-application.md). Opening it reads
 * and never writes the application: the status changes only when a send
 * is accepted by the email provider.
 */
export default async function SendApplicationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  const { t } = await getTranslator();

  const data = await loadComposer(workspace.id, id);
  if (!data) notFound();

  const account = await getSessionAccountInfo();
  const config = getApplicationEmailConfig();
  const pin = (view: typeof data.attachments.cv) =>
    view
      ? {
          id: view.pdf.id,
          filename: view.pdf.filename,
          byteSize: view.pdf.byteSize,
          createdAt: view.pdf.createdAt.toISOString(),
          current: view.current,
          newerAvailable: view.newerAvailable ? { id: view.newerAvailable.id, filename: view.newerAvailable.filename, createdAt: view.newerAvailable.createdAt.toISOString() } : null,
        }
      : null;

  const props: ComposerProps = {
    application: data.application,
    problems: data.problems,
    pdfs: data.pdfStatus ? describePdfStatus(data.pdfStatus) : null,
    attachments: { cv: pin(data.attachments.cv), letter: pin(data.attachments.letter) },
    draft: data.draft,
    prefill: data.prefill,
    lastSent: data.lastSent,
    unresolved: data.unresolved,
    sendCount: data.sendCount,
    sender: {
      available: config.unavailableReason === null && Boolean(config.fromAddress),
      from: config.fromAddress ? `${senderDisplayName(data.candidateName ?? account.fullName, config)} <${config.fromAddress}>` : null,
      replyTo: account.email,
    },
    pdfRenderer: pdfRendererConfigured(),
    emailLanguage: data.emailLanguage,
    contactDefaults: data.contactDefaults,
  };

  const job = [data.application.jobTitle, data.application.employer].filter(Boolean).join(" · ");
  return (
    <>
      <PageHeader
        kicker={t("resumatch.send.kicker")}
        title={t("resumatch.send.title")}
        description={job ? t("resumatch.send.description", { job }) : undefined}
      />
      {/* Applied elsewhere (application-timeline.md): records it without
          an email, so nothing below is needed. */}
      <p className="rm-sent-nav" data-testid="record-external-shortcut">
        {t("resumatch.tl.ext.shortcut")}{" "}
        <a href={`/applications/${encodeURIComponent(id)}/external`}>{t("resumatch.tl.ext.shortcutLink")}</a>
      </p>
      <Composer {...props} />
    </>
  );
}

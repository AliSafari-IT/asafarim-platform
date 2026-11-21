import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { getSentEmail } from "../../../../lib/applicationEmail/sentList";
import { DEFAULT_SENT_QUERY, sentListHref } from "../../../../lib/applicationEmail/sentQuery";
import { getTranslator } from "../../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { LocalTime } from "../../../ai-usage/LocalTime";
import { SentStatusBadge } from "../SentStatusBadge";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.sent.detail.metaTitle") };
}
export const dynamic = "force-dynamic";

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * One sent email, read-only, exactly as it was sent: the stored snapshot,
 * not today's profile, job or draft. The attachments link to the very PDF
 * rows that went out (immutable, hash-checked when served).
 */
export default async function SentApplicationPage({ params }: { params: Promise<{ sentId: string }> }) {
  const { sentId } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  const { t } = await getTranslator();
  const sent = await getSentEmail(workspace.id, sentId);
  if (!sent) notFound();

  const rows: [string, React.ReactNode][] = [
    [t("resumatch.sent.detail.sentId"), <code key="id">{sent.id}</code>],
    [
      t("resumatch.sent.col.company"),
      <a key="c" href={sentListHref({ ...DEFAULT_SENT_QUERY, company: sent.companyKey })}>
        {sent.companyName}
      </a>,
    ],
    [t("resumatch.sent.col.job"), sent.jobTitle ?? "—"],
    [t("resumatch.sent.detail.from"), sent.fromAddress],
    [
      t("resumatch.sent.detail.to"),
      <a key="to" href={sentListHref({ ...DEFAULT_SENT_QUERY, contact: sent.contactEmailNormalized })}>
        {sent.contactName ? `${sent.contactName} <${sent.contactEmail}>` : sent.contactEmail}
      </a>,
    ],
    [t("resumatch.sent.detail.replyTo"), sent.replyTo ?? "—"],
    [t("resumatch.sent.detail.bcc"), sent.bccSelf ?? t("resumatch.sent.detail.noCopy")],
    [t("resumatch.sent.detail.attempted"), <LocalTime key="a" iso={sent.attemptedAt.toISOString()} />],
    [t("resumatch.sent.detail.sentAt"), sent.sentAt ? <LocalTime key="s" iso={sent.sentAt.toISOString()} /> : "—"],
    [t("resumatch.sent.col.applied"), sent.appliedAt ? <LocalTime key="ap" iso={sent.appliedAt.toISOString()} /> : "—"],
    [t("resumatch.sent.col.status"), <SentStatusBadge key="st" status={sent.status} delivery={sent.deliveryStatus} />],
  ];

  return (
    <>
      <PageHeader kicker={t("resumatch.sent.title")} title={sent.subject} description={t("resumatch.sent.detail.description")} />
      <p className="rm-sent-nav">
        <Link href="/applications/sent">{t("resumatch.sent.detail.back")}</Link>
        {sent.applicationId ? (
          <>
            {" · "}
            <a href={sentListHref({ ...DEFAULT_SENT_QUERY, application: sent.applicationId })}>{t("resumatch.sent.detail.applicationHistory")}</a>
          </>
        ) : null}
      </p>

      {sent.status === "UNCERTAIN" || sent.status === "SENDING" ? <Alert tone="warning">{t("resumatch.sent.detail.uncertain")}</Alert> : null}
      {sent.status === "FAILED" ? <Alert tone="error">{t("resumatch.sent.detail.failed")}</Alert> : null}

      <dl className="rm-sent-detail" data-testid="sent-detail">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="rm-composer__heading">{t("resumatch.sent.detail.message")}</h2>
      <pre className="rm-sent-body" data-testid="sent-body">
        {sent.body}
      </pre>

      <h2 className="rm-composer__heading">{t("resumatch.send.attachments.heading")}</h2>
      <ul className="rm-attachment-list">
        {sent.attachments.map((attachment) => (
          <li key={attachment.id} className="rm-attachment" data-testid="sent-attachment">
            <span className="rm-attachment__icon" aria-hidden="true">
              PDF
            </span>
            <span className="rm-attachment__main">
              <span className="rm-attachment__name">{attachment.filename}</span>
              <span className="rm-attachment__meta">
                {t(`resumatch.send.attachments.kind.${attachment.kind === "CV" ? "cv" : "letter"}`)} · {formatBytes(attachment.byteSize)} ·{" "}
                {t("resumatch.send.attachments.made")} <LocalTime iso={attachment.documentPdf.createdAt.toISOString()} />
              </span>
              <span className="rm-attachment__meta">
                SHA-256 <code>{attachment.contentHash.slice(0, 16)}…</code>
              </span>
            </span>
            <span className="rm-attachment__actions">
              <a href={`/api/pdfs/${encodeURIComponent(attachment.documentPdfId)}`} target="_blank" rel="noopener" className="ui-btn ui-btn--ghost ui-btn--sm">
                {t("resumatch.send.attachments.preview")}
                <span className="sr-only"> {attachment.filename}</span>
              </a>
              <a href={`/api/pdfs/${encodeURIComponent(attachment.documentPdfId)}?download=1`} className="ui-btn ui-btn--ghost ui-btn--sm">
                {t("resumatch.send.attachments.download")}
                <span className="sr-only"> {attachment.filename}</span>
              </a>
            </span>
          </li>
        ))}
      </ul>

      <details className="rm-sent-tech">
        <summary>{t("resumatch.sent.detail.technical")}</summary>
        <dl className="rm-sent-detail">
          <div>
            <dt>Message-ID</dt>
            <dd>
              <code>{sent.messageId}</code>
            </dd>
          </div>
          <div>
            <dt>{t("resumatch.sent.detail.providerResponse")}</dt>
            <dd>{sent.providerResponse ?? "—"}</dd>
          </div>
          {sent.errorCode ? (
            <div>
              <dt>{t("resumatch.sent.detail.errorCode")}</dt>
              <dd>
                <code>{sent.errorCode}</code>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t("resumatch.sent.detail.transition")}</dt>
            <dd>{sent.statusTransition ?? "—"}</dd>
          </div>
        </dl>
      </details>
      <p className="rm-composer__note">{t("resumatch.sent.detail.readOnly")}</p>
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../lib/db/client";
import { getTranslator } from "../../../lib/i18n-server";
import { getCurrentWorkspace } from "../../../lib/workspace";
import { describeJobSource, fileTypeLabel, formatBytes, jobPageFrom, splitJobText } from "../../../lib/jobs/source";
import { LocalTime } from "../../ai-usage/LocalTime";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.jobSource.page.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * One saved job as it was taken in (job-source.md): where it came from (the
 * link, the uploaded file names, pasted text or an email) and the text
 * ResuMatch kept. Read-only. Only the owning workspace can open it; any
 * other id is a 404. Uploaded files' bytes are never stored, so their text
 * is what is shown.
 */
export default async function JobSourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const from = jobPageFrom((await searchParams).from);
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();
  const job = await getJobmatchDb().targetJob.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true, title: true, employer: true, sourceUrl: true, sourceFiles: true, rawText: true, fetchedAt: true, createdAt: true },
  });
  if (!job) notFound();
  const { t } = await getTranslator();

  const source = describeJobSource(job);
  const sections = job.rawText ? splitJobText(job.rawText) : [];
  const heading = [job.title, job.employer].filter(Boolean).join(" · ");
  const back =
    from === "history"
      ? { href: "/tailor/history", label: t("resumatch.jobSource.page.backHistory") }
      : { href: "/applications", label: t("resumatch.jobSource.page.backApplications") };
  const savedAt = (job.fetchedAt ?? job.createdAt).toISOString();

  return (
    <>
      <PageHeader
        kicker={t("resumatch.jobSource.page.kicker")}
        title={heading || t("resumatch.untitledJob")}
        description={t("resumatch.jobSource.page.description")}
      />
      <p className="rm-sent-nav">
        <a href={back.href} data-testid="job-page-back">{back.label}</a>
      </p>

      <section className="rm-tl-summary rm-job-page__source" aria-label={t("resumatch.jobSource.page.sourceHeading")} data-testid="job-page-source">
        <dl className="rm-composer__meta">
          <div>
            <dt>{t("resumatch.jobSource.page.source")}</dt>
            <dd data-testid="job-page-kind">{t(`resumatch.jobSource.kind.${source.kind}`)}</dd>
          </div>
          {source.url ? (
            <div>
              <dt>{t("resumatch.jobSource.page.link")}</dt>
              <dd className="rm-job-page__url">
                <a href={source.url} target="_blank" rel="noopener noreferrer" data-testid="job-page-open">
                  {source.url}
                  <span className="sr-only"> {t("resumatch.jobSource.newTab")}</span>
                </a>
              </dd>
            </div>
          ) : null}
          <div>
            <dt>{t("resumatch.jobSource.page.savedAt")}</dt>
            <dd>
              <LocalTime iso={savedAt} />
            </dd>
          </div>
        </dl>
        {source.files.length > 0 ? (
          <>
            <h2 className="rm-job-page__subhead">{t("resumatch.jobSource.page.files", { count: source.files.length + source.moreFiles })}</h2>
            <ul className="rm-job-page__files" data-testid="job-page-files">
              {source.files.map((file, index) => {
                const type = fileTypeLabel(file.contentType, file.name);
                return (
                  <li key={`${index}-${file.name}`} data-testid="job-page-file">
                    <span className="rm-job-page__file-name">{file.name}</span>
                    {type || file.bytes != null ? (
                      <span className="rm-job-page__file-meta">
                        {[type, file.bytes != null ? formatBytes(file.bytes) : null].filter(Boolean).join(" · ")}
                      </span>
                    ) : null}
                  </li>
                );
              })}
              {source.moreFiles > 0 ? <li>{t("resumatch.jobSource.moreFiles", { count: source.moreFiles })}</li> : null}
            </ul>
          </>
        ) : null}
        <p className="rm-job-page__note" data-testid="job-page-note">
          {t(`resumatch.jobSource.page.note.${source.kind}`)}
        </p>
      </section>

      <section className="rm-job-page__text" aria-labelledby="job-text-heading">
        <h2 id="job-text-heading">{t("resumatch.jobSource.page.textHeading")}</h2>
        {sections.length === 0 ? (
          <Alert tone="info">{t("resumatch.jobSource.page.noText")}</Alert>
        ) : (
          sections.map((section, index) => (
            <div key={index} className="rm-job-page__section" data-testid="job-page-text">
              {section.file ? <h3 className="rm-job-page__file-head">{section.file}</h3> : null}
              <div className="rm-job-page__body">{section.text}</div>
            </div>
          ))
        )}
      </section>
    </>
  );
}

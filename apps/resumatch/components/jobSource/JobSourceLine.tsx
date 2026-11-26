"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { jobPageHref, type JobPageFrom, type JobSourceView } from "../../lib/jobs/source";

/**
 * One line naming where a saved job came from (job-source.md): the job
 * link with "Open job posting", the uploaded file names, or pasted text,
 * plus "View saved job" for the text ResuMatch kept. Shared by the
 * application cards, the timeline page and Tailor history.
 */
export function JobSourceLine({
  source,
  targetJobId,
  from,
  className = "rm-job-source",
  as: Tag = "p",
}: {
  source: JobSourceView;
  targetJobId: string;
  from: JobPageFrom;
  className?: string;
  /** "span" inside phrasing content, such as Tailor history's row label. */
  as?: "p" | "span";
}) {
  const { t } = useTranslation();
  const names = source.files.map((f) => f.name);
  return (
    <Tag className={className} data-testid="job-source" data-kind={source.kind}>
      <span className="rm-job-source__label">{t("resumatch.jobSource.label")}</span>{" "}
      <span data-testid="job-source-kind">{t(`resumatch.jobSource.kind.${source.kind}`)}</span>
      {source.kind === "link" && source.url ? (
        <>
          {" · "}
          <a href={source.url} target="_blank" rel="noopener noreferrer" data-testid="job-source-open" title={source.url}>
            {t("resumatch.jobSource.openPosting", { host: source.host ?? source.url })}
            <span className="sr-only"> {t("resumatch.jobSource.newTab")}</span>
          </a>
        </>
      ) : null}
      {names.length > 0 ? (
        <>
          {": "}
          <span className="rm-job-source__files" data-testid="job-source-files">
            {names.join(", ")}
            {source.moreFiles > 0 ? ` ${t("resumatch.jobSource.moreFiles", { count: source.moreFiles })}` : null}
          </span>
        </>
      ) : null}
      {" · "}
      <a href={jobPageHref(targetJobId, from)} data-testid="job-source-view">
        {t("resumatch.jobSource.viewSaved")}
      </a>
    </Tag>
  );
}

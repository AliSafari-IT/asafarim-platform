import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getTranslator } from "../../../../lib/i18n-server";
import { parseCoverLetterContent } from "../../../../lib/tailoring/ai/coverLetter/schema";
import { computeCoverLetterQuality } from "../../../../lib/tailoring/coverLetterQuality";
import { LANGUAGE_LABELS, isOutputLanguage } from "../../../../lib/tailoring/language";
import { buildLetterLayout, letterDensity, letterWordCount } from "../../../../lib/tailoring/coverLetterLayout";
import { parseProfileContent } from "../../../../lib/profile/contract";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { PrintButton } from "../../../../components/tailoring/PrintButton";
import { CoverLetterDocxButton } from "./CoverLetterDocxButton";
import { CoverLetterQualityChecklist } from "../../../../components/tailoring/CoverLetterQualityChecklist";
import { SendApplicationEntry } from "../../../../components/applicationEmail/SendApplicationEntry";
import { describePdfStatus } from "../../../../lib/documentPdfs/describe";
import { getPdfStatus } from "../../../../lib/documentPdfs/service";

/** The tab title doubles as the browser's default PDF file name, so it
 *  names the candidate and the employer rather than the site. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { t } = await getTranslator();
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  const row = workspace
    ? await getJobmatchDb().coverLetter.findFirst({
        where: { id, workspaceId: workspace.id },
        select: { content: true, targetJob: { select: { employer: true } } },
      })
    : null;
  const fullName = row ? parseCoverLetterContent(row.content).fullName : null;
  const parts = [fullName, t("resumatch.coverLetter"), row?.targetJob.employer].filter(Boolean);
  return { title: { absolute: parts.join(" – ") } };
}
export const dynamic = "force-dynamic";

/**
 * Read-only cover-letter preview (issue #454, part of #453). Print
 * (window.print() against the `.rm-letter` rules in app/resumatch.css)
 * and DOCX (issue #457, lib/tailoring/coverLetterDocx.ts) both render from
 * this same persisted `CoverLetterContent` — the same "nothing beyond
 * what was reviewed and approved" content this page already shows, and
 * the same "print and DOCX can never diverge" guarantee #435 established
 * for the CV side.
 */
export default async function CoverLetterPreviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const { t } = await getTranslator();
  const db = getJobmatchDb();
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's cover letter.
  const row = await db.coverLetter.findFirst({
    where: { id, workspaceId: workspace.id },
    select: {
      content: true,
      degraded: true,
      outputLanguage: true,
      tailoredResumeId: true,
      createdAt: true,
      profileVersion: { select: { content: true } },
      targetJob: { select: { title: true, employer: true, structuredFields: true } },
    },
  });
  if (!row) notFound();

  const content = parseCoverLetterContent(row.content);
  // No stored record of which length was requested at generation time
  // (#455 doesn't persist tone/length on the row, only the resulting
  // text) — "standard" is a reasonable general-purpose default for this
  // read-only view, same as the review screen's own default.
  const language = isOutputLanguage(row.outputLanguage) ? row.outputLanguage : null;
  const quality = computeCoverLetterQuality(content, "standard", language);
  const jobLabel = [row.targetJob.title, row.targetJob.employer].filter(Boolean).join(" · ");
  const profile = parseProfileContent(row.profileVersion.content);
  const layout = buildLetterLayout(
    {
      fullName: content.fullName,
      email: profile.email,
      phone: profile.phone,
      baseLocation: profile.baseLocation,
      links: profile.links,
    },
    row.targetJob,
    row.createdAt,
    row.outputLanguage,
  );
  const density = letterDensity(letterWordCount(content));
  const [pdfStatus, application] = row.tailoredResumeId
    ? await Promise.all([
        getPdfStatus(workspace.id, row.tailoredResumeId),
        db.application.findFirst({
          where: { workspaceId: workspace.id, tailoredResumeId: row.tailoredResumeId },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: { id: true },
        }),
      ])
    : [null, null];

  return (
    <>
      {/* Everything outside the <article> is screen-only: the print/PDF
          output is the letter alone (app/resumatch.css, @media print). */}
      <div className="rm-screen-only">
        <PageHeader
          kicker={t("resumatch.preview.kicker")}
          title={t("resumatch.letter.title")}
          description={jobLabel ? t("resumatch.letter.description", { job: jobLabel }) : undefined}
        />
        {row.tailoredResumeId ? (
          <p className="rm-letter-nav">
            <Link href={`/tailor/${row.tailoredResumeId}/preview`}>{t("resumatch.letter.backToCv")}</Link>
            {/* Reopens tailoring on the same job with the letter ticked and
                this run's choices filled in; saved as a new CV + letter. */}
            <Link
              href={`/tailor?from=${row.tailoredResumeId}&letter=1#tailor-flow`}
              className="ui-btn ui-btn--ghost ui-btn--sm"
              data-testid="edit-regenerate-letter"
            >
              {t("resumatch.letter.editRegenerate")}
            </Link>
          </p>
        ) : null}

        {language ? (
          <p className="rx-lang-note">
            <span className="rx-pill rx-pill--lang">{LANGUAGE_LABELS[language]}</span>
            {t("resumatch.letter.langNote", { language: t(`resumatch.lang.${language}`) })}
          </p>
        ) : null}

        {row.degraded ? (
          <Alert tone="warning">{t("resumatch.letter.degraded")}</Alert>
        ) : (
          <>
            <div className="rm-preview-toolbar">
              <PrintButton />
              <CoverLetterDocxButton id={id} />
              {row.tailoredResumeId ? (
                <SendApplicationEntry
                  tailoredResumeId={row.tailoredResumeId}
                  applicationId={application?.id ?? null}
                  hasCoverLetter
                  pdfs={pdfStatus ? describePdfStatus(pdfStatus) : null}
                  layout="toolbar"
                />
              ) : null}
            </div>
            <CoverLetterQualityChecklist quality={quality} />
          </>
        )}
      </div>

      {/* lang= tells screen readers and spell-checkers which language the
          letter is in (#642); none for older letters, as before. */}
      <article
        className={`rm-resume rm-resume--classic rm-letter rm-letter--${density}`}
        lang={language ?? undefined}
        data-testid="cover-letter"
      >
        <header className="rm-letter__head">
          <div className="rm-letter__sender">
            {layout.sender.name ? <p className="rm-letter__sender-name">{layout.sender.name}</p> : null}
            {layout.sender.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {layout.sender.links.length > 0 ? (
              <p className="rm-letter__links">
                {layout.sender.links.map((link, index) => (
                  <span key={link.url}>
                    {index > 0 ? " · " : null}
                    <a href={link.url}>{link.text}</a>
                  </span>
                ))}
              </p>
            ) : null}
          </div>
          {layout.recipient.length > 0 ? (
            <div className="rm-letter__recipient">
              {layout.recipient.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
          <p className="rm-letter__date">{layout.dateLine}</p>
          {layout.subject ? <p className="rm-letter__subject">{layout.subject}</p> : null}
        </header>
        <p>{content.greeting}</p>
        {content.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <p className="rm-letter__signoff">
          {content.signOff}
          <br />
          {content.fullName}
        </p>
      </article>
    </>
  );
}

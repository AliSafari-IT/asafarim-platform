import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { ClassicTemplate } from "../../../../components/tailoring/templates/Classic";
import { getJobmatchDb } from "../../../../lib/db/client";
import { getTranslator } from "../../../../lib/i18n-server";
import { parseTailoredResumeContent } from "../../../../lib/tailoring/ai/schema";
import { computeCoverage } from "../../../../lib/tailoring/coverage";
import { computeQuality } from "../../../../lib/tailoring/quality";
import { LANGUAGE_LABELS, isOutputLanguage } from "../../../../lib/tailoring/language";
import { LanguageBadge } from "../../../components/app/LanguageBadge";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { cvShowsPhoto, photoSrc } from "../../../../lib/profile/photo";
import { getProfilePhoto } from "../../../../lib/profile/photoStore";
import { PhotoToggle } from "./PhotoToggle";
import { CoverageReport } from "./CoverageReport";
import { DocxButton } from "./DocxButton";
import { PrintButton } from "../../../../components/tailoring/PrintButton";
import { QualityChecklist } from "./QualityChecklist";
import { SaveApplicationButton } from "./SaveApplicationButton";

/** The tab title doubles as the browser's default PDF file name, so it
 *  names the candidate and the employer rather than the site (as the
 *  cover-letter preview does). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { t } = await getTranslator();
  const { id } = await params;
  const workspace = await getCurrentWorkspace();
  const row = workspace
    ? await getJobmatchDb().tailoredResume.findFirst({
        where: { id, workspaceId: workspace.id },
        select: { content: true, targetJob: { select: { employer: true } } },
      })
    : null;
  if (!row) return { title: t("resumatch.preview.metaTitle") };
  const fullName = parseTailoredResumeContent(row.content).fullName;
  const parts = [fullName, "CV", row.targetJob.employer].filter(Boolean);
  return { title: { absolute: parts.join(" – ") } };
}
export const dynamic = "force-dynamic";

export default async function TailoredResumePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ coverLetterId?: string; coverLetterFailed?: string }>;
}) {
  const { id } = await params;
  const { coverLetterId: coverLetterIdFromQuery, coverLetterFailed } = await searchParams;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const { t } = await getTranslator();
  const db = getJobmatchDb();
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's tailored resume.
  const row = await db.tailoredResume.findFirst({
    where: { id, workspaceId: workspace.id },
    select: {
      content: true,
      degraded: true,
      outputLanguage: true,
      showPhoto: true,
      targetJobId: true,
      targetJob: { select: { rawText: true, title: true, employer: true } },
      // The persisted pairing (see schema's CoverLetter.tailoredResumeId
      // comment) — read this instead of relying only on the query param,
      // so "View cover letter" still shows up on a later visit, not just
      // right after generation.
      coverLetter: { select: { id: true, outputLanguage: true } },
    },
  });
  if (!row) notFound();

  const coverLetterId = row.coverLetter?.id ?? coverLetterIdFromQuery ?? null;

  // The photo is joined in here, at render time, from its own row — never
  // from the CV's content, which the AI wrote.
  const profilePhoto = await getProfilePhoto(workspace.id);
  const showPhoto = cvShowsPhoto(profilePhoto, row.showPhoto);

  const content = parseTailoredResumeContent(row.content);

  // Derived at render, never stored: the same "coverage describes the
  // document, it never becomes part of it" boundary the rest of tailoring
  // enforces. See lib/tailoring/coverage.ts.
  const resumeText = [
    content.headline,
    content.summary,
    content.skills.join(" "),
    ...content.experience.flatMap((entry) => [entry.title, entry.employer, ...entry.bullets]),
  ]
    .filter(Boolean)
    .join(" ");
  const coverage = row.targetJob.rawText ? computeCoverage(content.skills, row.targetJob.rawText, resumeText) : null;
  const quality = computeQuality(content, row.outputLanguage);

  const jobLabel = [row.targetJob.title, row.targetJob.employer].filter(Boolean).join(" · ");

  return (
    <>
      {/* Everything outside the CV <article> is screen-only: the print/PDF
          output is the CV alone (app/resumatch.css, @media print). */}
      <div className="rm-screen-only">
      <PageHeader
        kicker={t("resumatch.preview.kicker")}
        title={t("resumatch.preview.title")}
        description={jobLabel ? t("resumatch.preview.description", { job: jobLabel }) : undefined}
      />

      {row.outputLanguage && isOutputLanguage(row.outputLanguage) ? (
        <p className="rx-lang-note">
          <span className="rx-pill rx-pill--lang">{LANGUAGE_LABELS[row.outputLanguage]}</span>
          {t("resumatch.preview.langNote", { language: t(`resumatch.lang.${row.outputLanguage}`) })}
        </p>
      ) : null}

      {row.degraded ? (
        <Alert tone="warning">
          {t("resumatch.preview.degraded")}
        </Alert>
      ) : null}

      {coverLetterFailed === "1" && !coverLetterId ? (
        <Alert tone="warning">{t("resumatch.preview.coverLetterFailed")}</Alert>
      ) : null}

      <div className="rm-preview-toolbar">
        <PrintButton />
        <DocxButton id={id} />
        <SaveApplicationButton targetJobId={row.targetJobId} tailoredResumeId={id} />
        {coverLetterId ? (
          <>
            <Link href={`/cover-letter/${coverLetterId}/preview`} className="ui-btn ui-btn--ghost ui-btn--sm">
              {t("resumatch.preview.viewCoverLetter")}
            </Link>
            <LanguageBadge language={row.coverLetter?.outputLanguage} coverLetter />
          </>
        ) : (
          <span className="rm-preview-toolbar__hint">{t("resumatch.preview.noCoverLetter")}</span>
        )}
      </div>

      <PhotoToggle id={id} hasPhoto={profilePhoto !== null} initialShown={showPhoto} />

      {coverage ? <CoverageReport coverage={coverage} /> : null}
      <QualityChecklist quality={quality} />
      </div>

      <ClassicTemplate
        content={content}
        language={row.outputLanguage}
        photo={profilePhoto && showPhoto ? { src: photoSrc(profilePhoto.contentHash), shape: profilePhoto.shape } : null}
      />
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { ClassicTemplate } from "../../../../components/tailoring/templates/Classic";
import { getJobmatchDb } from "../../../../lib/db/client";
import { parseTailoredResumeContent } from "../../../../lib/tailoring/ai/schema";
import { computeCoverage } from "../../../../lib/tailoring/coverage";
import { computeQuality } from "../../../../lib/tailoring/quality";
import { LANGUAGE_LABELS, isOutputLanguage } from "../../../../lib/tailoring/language";
import { LanguageBadge } from "../../../components/app/LanguageBadge";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { CoverageReport } from "./CoverageReport";
import { DocxButton } from "./DocxButton";
import { PrintButton } from "../../../../components/tailoring/PrintButton";
import { QualityChecklist } from "./QualityChecklist";
import { SaveApplicationButton } from "./SaveApplicationButton";

export const metadata: Metadata = { title: "Preview" };
export const dynamic = "force-dynamic";

export default async function TailoredResumePreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ coverLetterId?: string }>;
}) {
  const { id } = await params;
  const { coverLetterId: coverLetterIdFromQuery } = await searchParams;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const db = getJobmatchDb();
  // Scoped to the workspace so an id from the URL cannot reach another
  // candidate's tailored resume.
  const row = await db.tailoredResume.findFirst({
    where: { id, workspaceId: workspace.id },
    select: {
      content: true,
      degraded: true,
      outputLanguage: true,
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
      <PageHeader
        kicker="Tailor"
        title="Your tailored CV"
        description={jobLabel ? `Tailored toward ${jobLabel}.` : undefined}
      />

      {row.outputLanguage && isOutputLanguage(row.outputLanguage) ? (
        <p className="rx-lang-note">
          <span className="rx-pill rx-pill--lang">{LANGUAGE_LABELS[row.outputLanguage]}</span>
          Written in {LANGUAGE_LABELS[row.outputLanguage]}. Employers, job titles, dates, education
          and skill names are kept exactly as in your profile.
        </p>
      ) : null}

      {row.degraded ? (
        <Alert tone="warning">
          This version could not be AI-tailored right now (budget or provider issue), so it shows
          your confirmed profile carried over unchanged. Try generating it again later.
        </Alert>
      ) : null}

      <div className="rm-preview-toolbar">
        <PrintButton />
        <DocxButton id={id} />
        <SaveApplicationButton targetJobId={row.targetJobId} tailoredResumeId={id} />
        {coverLetterId ? (
          <>
            <Link href={`/cover-letter/${coverLetterId}/preview`} className="ui-btn ui-btn--ghost ui-btn--sm">
              View cover letter
            </Link>
            <LanguageBadge language={row.coverLetter?.outputLanguage} coverLetter />
          </>
        ) : (
          <span className="rm-preview-toolbar__hint">No cover letter for this CV.</span>
        )}
      </div>

      {coverage ? <CoverageReport coverage={coverage} /> : null}
      <QualityChecklist quality={quality} />

      <ClassicTemplate content={content} language={row.outputLanguage} />
    </>
  );
}

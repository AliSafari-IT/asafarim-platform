import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../../lib/db/client";
import { parseCoverLetterContent } from "../../../../lib/tailoring/ai/coverLetter/schema";
import { computeCoverLetterQuality } from "../../../../lib/tailoring/coverLetterQuality";
import { LANGUAGE_LABELS, isOutputLanguage } from "../../../../lib/tailoring/language";
import { getCurrentWorkspace } from "../../../../lib/workspace";
import { PrintButton } from "../../../../components/tailoring/PrintButton";
import { CoverLetterDocxButton } from "./CoverLetterDocxButton";
import { CoverLetterQualityChecklist } from "../../../../components/tailoring/CoverLetterQualityChecklist";

export const metadata: Metadata = { title: "Cover letter" };
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
      targetJob: { select: { title: true, employer: true } },
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

  return (
    <>
      <PageHeader
        kicker="Tailor"
        title="Your cover letter"
        description={jobLabel ? `Written for ${jobLabel}.` : undefined}
      />
      {row.tailoredResumeId ? (
        <p style={{ margin: "-0.5rem 0 1rem" }}>
          <Link href={`/tailor/${row.tailoredResumeId}/preview`}>← View the tailored CV it goes with</Link>
        </p>
      ) : null}

      {language ? (
        <p className="rx-lang-note">
          <span className="rx-pill rx-pill--lang">{LANGUAGE_LABELS[language]}</span>
          Written in {LANGUAGE_LABELS[language]}. Names, numbers and dates are kept exactly as in your
          profile and the job.
        </p>
      ) : null}

      {row.degraded ? (
        <Alert tone="warning">
          This letter could not be AI-drafted right now (budget or provider issue).
        </Alert>
      ) : (
        <>
          <div className="rm-preview-toolbar">
            <PrintButton />
            <CoverLetterDocxButton id={id} />
          </div>
          <CoverLetterQualityChecklist quality={quality} />
        </>
      )}

      {/* lang= tells screen readers and spell-checkers which language the
          letter is in (#642); none for older letters, as before. */}
      <article className="rm-resume rm-resume--classic rm-letter" lang={language ?? undefined}>
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

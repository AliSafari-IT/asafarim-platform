import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../../lib/db/client";
import { parseCoverLetterContent } from "../../../../lib/tailoring/ai/coverLetter/schema";
import { getCurrentWorkspace } from "../../../../lib/workspace";

export const metadata: Metadata = { title: "Cover letter" };
export const dynamic = "force-dynamic";

/**
 * Read-only cover-letter preview (issue #454, part of #453). Print/DOCX
 * export is #457's scope — this just renders what generate-confirm
 * persisted, the same "nothing beyond what was reviewed and approved"
 * content the tailored-resume preview page already shows.
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
    select: { content: true, degraded: true },
  });
  if (!row) notFound();

  const content = parseCoverLetterContent(row.content);

  return (
    <>
      <PageHeader kicker="Tailor" title="Your cover letter" />

      {row.degraded ? (
        <Alert tone="warning">
          This letter could not be AI-drafted right now (budget or provider issue).
        </Alert>
      ) : null}

      <article className="rm-resume rm-resume--classic">
        <p>{content.greeting}</p>
        {content.paragraphs.map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
        <p>
          {content.signOff}
          <br />
          {content.fullName}
        </p>
      </article>
    </>
  );
}

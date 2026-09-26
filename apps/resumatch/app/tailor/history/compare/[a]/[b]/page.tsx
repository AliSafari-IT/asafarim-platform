import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Alert, Card, PageHeader } from "@asafarim/ui";
import { getJobmatchDb } from "../../../../../../lib/db/client";
import { getTranslator } from "../../../../../../lib/i18n-server";
import { parseTailoredResumeContent } from "../../../../../../lib/tailoring/ai/schema";
import { diffTailoredResumes } from "../../../../../../lib/tailoring/diff";
import { getCurrentWorkspace } from "../../../../../../lib/workspace";
import { LanguageBadge } from "../../../../../components/app/LanguageBadge";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("resumatch.compare.metaTitle") };
}
export const dynamic = "force-dynamic";

/**
 * Side-by-side / field-level comparison of two `TailoredResume` versions
 * (issue #434). Read-only, derived at render from
 * lib/tailoring/diff.ts — nothing here is persisted, the same "describes
 * the documents, never becomes part of them" boundary the coverage report
 * (#428) and quality checklist (#433) already follow.
 */
export default async function CompareTailoredResumesPage({
  params,
}: {
  params: Promise<{ a: string; b: string }>;
}) {
  const { a: idA, b: idB } = await params;
  const workspace = await getCurrentWorkspace();
  if (!workspace) notFound();

  const { locale, t } = await getTranslator();
  const db = getJobmatchDb();
  // Both scoped to the workspace, same as every other tailored-resume
  // read — an id from the URL cannot reach another candidate's version.
  const [rowA, rowB] = await Promise.all([
    db.tailoredResume.findFirst({
      where: { id: idA, workspaceId: workspace.id },
      select: { content: true, createdAt: true, outputLanguage: true, targetJob: { select: { title: true, employer: true } } },
    }),
    db.tailoredResume.findFirst({
      where: { id: idB, workspaceId: workspace.id },
      select: { content: true, createdAt: true, outputLanguage: true, targetJob: { select: { title: true, employer: true } } },
    }),
  ]);
  if (!rowA || !rowB) notFound();

  const contentA = parseTailoredResumeContent(rowA.content);
  const contentB = parseTailoredResumeContent(rowB.content);
  const diff = diffTailoredResumes(contentA, contentB);
  // In the UI language rather than the server's default locale. Rendered
  // on the server only, so there is no hydration mismatch to worry about.
  const formatDate = (value: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC";
  const none = <em>{t("resumatch.compare.none")}</em>;

  return (
    <>
      <PageHeader kicker={t("resumatch.compare.kicker")} title={t("resumatch.compare.title")} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card title={rowA.targetJob.title ?? rowA.targetJob.employer ?? t("resumatch.compare.versionA")}>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{formatDate(rowA.createdAt)}</p>
          <LanguageBadge language={rowA.outputLanguage} />
        </Card>
        <Card title={rowB.targetJob.title ?? rowB.targetJob.employer ?? t("resumatch.compare.versionB")}>
          <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{formatDate(rowB.createdAt)}</p>
          <LanguageBadge language={rowB.outputLanguage} />
        </Card>
      </div>

      <Card title={t("resumatch.compare.headline")}>
        {diff.headlineChanged ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <p>{contentA.headline ?? none}</p>
            <p>{contentB.headline ?? none}</p>
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>
            {t("resumatch.compare.unchangedPrefix")}
            {contentA.headline ?? none}
          </p>
        )}
      </Card>

      <Card title={t("resumatch.compare.summary")}>
        {diff.summaryChanged ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "1rem",
            }}
          >
            <p>{contentA.summary ?? none}</p>
            <p>{contentB.summary ?? none}</p>
          </div>
        ) : (
          <p style={{ color: "var(--muted)" }}>
            {t("resumatch.compare.unchangedPrefix")}
            {contentA.summary ?? none}
          </p>
        )}
      </Card>

      <Card title={t("resumatch.compare.skills")}>
        {diff.skills.added.length === 0 && diff.skills.removed.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>
            {t("resumatch.compare.skillsUnchanged", {
              count: diff.skills.common.length,
            })}
          </p>
        ) : (
          <>
            {diff.skills.added.length > 0 ? (
              <p>
                <strong>{t("resumatch.compare.added")}</strong> {diff.skills.added.join(", ")}
              </p>
            ) : null}
            {diff.skills.removed.length > 0 ? (
              <p>
                <strong>{t("resumatch.compare.removed")}</strong> {diff.skills.removed.join(", ")}
              </p>
            ) : null}
          </>
        )}
      </Card>

      {diff.experience.length > 0 ? (
        <Card title={t("resumatch.compare.experience")}>
          {diff.experience.map((entry, index) => (
            <div key={index} style={{ marginTop: index > 0 ? "1rem" : 0 }}>
              <strong>
                {entry.title}
                {entry.employer ? ` · ${entry.employer}` : ""}
              </strong>
              {entry.changed ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "1rem",
                    marginTop: "0.35rem",
                  }}
                >
                  <ul>
                    {entry.bulletsA.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                  <ul>
                    {entry.bulletsB.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.85rem",
                    margin: "0.3rem 0 0",
                  }}
                >
                  {t("resumatch.compare.unchanged")}
                </p>
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Alert tone="info">{t("resumatch.compare.noExperience")}</Alert>
      )}
    </>
  );
}

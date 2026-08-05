"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import {
  getArticle,
  getArticlesForAudience,
  getRelatedArticles,
  type HelpAudience,
} from "@/lib/help-content";
import { HelpBreadcrumbs } from "./HelpBreadcrumbs";
import { HelpStep } from "./HelpStep";
import { HelpRelatedArticles } from "./HelpRelatedArticles";

type Props = {
  audience: Exclude<HelpAudience, "both">;
  slug: string;
};

/**
 * Shared renderer for both /help/students/[slug] and /help/tutors/[slug] —
 * the two route files are thin wrappers passing their fixed `audience`.
 */
export function HelpArticleView({ audience, slug }: Props) {
  const { t } = useTranslation();
  const article = getArticle(audience, slug);
  if (!article) notFound();

  const siblings = getArticlesForAudience(audience);
  const index = siblings.findIndex((a) => a.slug === article.slug);
  const prev = index > 0 ? siblings[index - 1] : undefined;
  const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined;
  const related = getRelatedArticles(article);
  const basePath = audience === "tutor" ? "/help/tutors" : "/help/students";
  const audienceTitleKey =
    audience === "tutor" ? "edumatch.help.tutorsTitle" : "edumatch.help.studentsTitle";
  const prerequisites = t(article.prerequisitesKey)
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <HelpBreadcrumbs
        items={[
          { label: t("edumatch.help.breadcrumbHome"), href: "/help" },
          { label: t(audienceTitleKey), href: basePath },
          { label: t(article.titleKey) },
        ]}
      />

      <h1 className="text-2xl font-bold text-[var(--color-text)] sm:text-3xl">
        {t(article.titleKey)}
      </h1>
      <p className="mt-2 text-[var(--color-text-muted)]">{t(article.summaryKey)}</p>

      <Link
        href={article.workflowRoute}
        className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--color-primary)] px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
      >
        {t("edumatch.help.openWorkflow", { label: t(article.workflowLabelKey) })}
        <ExternalLink size={15} aria-hidden="true" />
      </Link>

      {prerequisites.length > 0 && (
        <section aria-labelledby="help-prereq-heading" className="mt-8">
          <h2 id="help-prereq-heading" className="text-lg font-semibold text-[var(--color-text)]">
            {t("edumatch.help.prerequisites")}
          </h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[var(--color-text-muted)]">
            {prerequisites.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="help-steps-heading" className="mt-8">
        <h2 id="help-steps-heading" className="text-lg font-semibold text-[var(--color-text)]">
          {t("edumatch.help.stepsHeading")}
        </h2>
        <ol className="mt-3 flex flex-col gap-3">
          {article.steps.map((step, i) => (
            <HelpStep
              key={step.titleKey}
              index={i + 1}
              total={article.steps.length}
              title={t(step.titleKey)}
              body={t(step.bodyKey)}
              visual={step.visual}
              stepLabel={t("edumatch.help.stepLabel")}
            />
          ))}
        </ol>
      </section>

      <section aria-labelledby="help-result-heading" className="mt-8 rounded-xl border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] p-4">
        <h2 id="help-result-heading" className="text-sm font-semibold uppercase tracking-wide text-[var(--color-accent)]">
          {t("edumatch.help.expectedResult")}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text)]">{t(article.expectedResultKey)}</p>
      </section>

      <section aria-labelledby="help-trouble-heading" className="mt-6">
        <h2 id="help-trouble-heading" className="text-lg font-semibold text-[var(--color-text)]">
          {t("edumatch.help.whatCanGoWrong")}
        </h2>
        <ul className="mt-2 space-y-2">
          {article.troubleshootingKeys.map((key) => (
            <li
              key={key}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text-muted)]"
            >
              {t(key)}
            </li>
          ))}
        </ul>
      </section>

      <HelpRelatedArticles articles={related} />

      <nav aria-label={t("edumatch.help.stepsHeading")} className="mt-10 flex flex-col gap-3 border-t border-[var(--color-border)] pt-6 sm:flex-row sm:justify-between">
        {prev ? (
          <Link
            href={`${basePath}/${prev.slug}`}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)]"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>
              {t("edumatch.help.prevArticle")}: {t(prev.titleKey)}
            </span>
          </Link>
        ) : (
          <span />
        )}
        {next && (
          <Link
            href={`${basePath}/${next.slug}`}
            className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-[var(--color-text-muted)] hover:text-[var(--color-primary)] sm:justify-end"
          >
            <span>
              {t("edumatch.help.nextArticle")}: {t(next.titleKey)}
            </span>
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </nav>
    </div>
  );
}

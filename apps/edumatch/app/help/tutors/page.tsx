"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { getArticlesForAudience } from "@/lib/help-content";
import { HelpBreadcrumbs } from "@/components/help/HelpBreadcrumbs";
import { HelpArticleCard } from "@/components/help/HelpArticleCard";

export default function HelpTutorsIndexPage() {
  const { t } = useTranslation();
  const articles = getArticlesForAudience("tutor");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <HelpBreadcrumbs
        items={[
          { label: t("edumatch.help.breadcrumbHome"), href: "/help" },
          { label: t("edumatch.help.tutorsTitle") },
        ]}
      />
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.help.tutorsTitle")}</h1>
      <p className="mt-1 text-[var(--color-text-muted)]">{t("edumatch.help.tutorsSubtitle")}</p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {articles.map((a) => (
          <li key={a.slug}>
            <HelpArticleCard
              href={`/help/tutors/${a.slug}`}
              title={t(a.titleKey)}
              summary={t(a.summaryKey)}
              audienceLabel={t("edumatch.help.audienceTutor")}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

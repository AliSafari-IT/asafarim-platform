"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { getArticlesForAudience } from "@/lib/help-content";
import { HelpBreadcrumbs } from "@/components/help/HelpBreadcrumbs";
import { HelpArticleCard } from "@/components/help/HelpArticleCard";

export default function HelpStudentsIndexPage() {
  const { t } = useTranslation();
  const articles = getArticlesForAudience("student");

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <HelpBreadcrumbs
        items={[
          { label: t("edumatch.help.breadcrumbHome"), href: "/help" },
          { label: t("edumatch.help.studentsTitle") },
        ]}
      />
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{t("edumatch.help.studentsTitle")}</h1>
      <p className="mt-1 text-[var(--color-text-muted)]">{t("edumatch.help.studentsSubtitle")}</p>

      <ul className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {articles.map((a) => (
          <li key={a.slug}>
            <HelpArticleCard
              href={`/help/students/${a.slug}`}
              title={t(a.titleKey)}
              summary={t(a.summaryKey)}
              audienceLabel={t("edumatch.help.audienceStudent")}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

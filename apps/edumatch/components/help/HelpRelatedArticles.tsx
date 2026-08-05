import { useTranslation } from "@asafarim/shared-i18n";
import type { HelpArticle } from "@/lib/help-content";
import { HelpArticleCard } from "./HelpArticleCard";

type Props = {
  articles: HelpArticle[];
};

/** "Related guides" list at the bottom of an article. */
export function HelpRelatedArticles({ articles }: Props) {
  const { t } = useTranslation();
  if (articles.length === 0) return null;

  const base = (audience: HelpArticle["audience"]) =>
    audience === "tutor" ? "/help/tutors" : "/help/students";

  return (
    <section aria-labelledby="help-related-heading" className="mt-10">
      <h2 id="help-related-heading" className="mb-3 text-lg font-semibold text-[var(--color-text)]">
        {t("edumatch.help.relatedArticles")}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {articles.map((article) => (
          <li key={`${article.audience}-${article.slug}`}>
            <HelpArticleCard
              href={`${base(article.audience)}/${article.slug}`}
              title={t(article.titleKey)}
              summary={t(article.summaryKey)}
              audienceLabel={
                article.audience === "tutor"
                  ? t("edumatch.help.audienceTutor")
                  : t("edumatch.help.audienceStudent")
              }
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

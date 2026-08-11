"use client";

import { useId, useMemo, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Search } from "lucide-react";
import {
  HELP_ARTICLES,
  resolveArticles,
  searchArticles,
  type HelpAudience,
} from "@/lib/help-content";
import { HelpArticleCard } from "./HelpArticleCard";

type Filter = "all" | "student" | "tutor";

function articleHref(slug: string, audience: HelpAudience): string {
  const base = audience === "tutor" ? "/help/tutors" : "/help/students";
  return `${base}/${slug}`;
}

/**
 * Localized, case-insensitive, keyboard-accessible search across every
 * Help article, with a student/tutor audience filter.
 *
 * Result count is announced via aria-live rather than moving focus away
 * from the input as the user types — stealing focus mid-keystroke would
 * be actively hostile to keyboard and screen-reader users, the opposite
 * of the accessibility goal.
 */
export function HelpSearch() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const inputId = useId();
  const resultsId = useId();

  const resolved = useMemo(() => resolveArticles(HELP_ARTICLES, t), [t]);
  const audienceFiltered = useMemo(
    () => (filter === "all" ? resolved : resolved.filter((a) => a.audience === filter)),
    [resolved, filter],
  );
  const results = useMemo(
    () => searchArticles(audienceFiltered, query, t),
    [audienceFiltered, query, t],
  );

  const showResults = query.trim().length > 0;

  return (
    <div>
      <label htmlFor={inputId} className="sr-only">
        {t("edumatch.help.searchLabel")}
      </label>
      <div className="relative">
        <Search
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]"
        />
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("edumatch.help.searchPlaceholder")}
          aria-describedby={showResults ? resultsId : undefined}
          className="w-full rounded-xl border border-[var(--color-border-field)] bg-[var(--color-surface)] py-3.5 pl-11 pr-4 text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t("edumatch.help.audienceStudent")}>
        {(
          [
            ["all", t("edumatch.help.filterAll")],
            ["student", t("edumatch.help.audienceStudent")],
            ["tutor", t("edumatch.help.audienceTutor")],
          ] as [Filter, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
            className={`min-h-[36px] rounded-full border px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-focus)] ${
              filter === value
                ? // White text on --color-primary (#7d9bff in the dark theme,
                  // the default) is a WCAG AA contrast failure — 2.62:1
                  // against the 4.5:1 required. Dark text matches the
                  // pattern already used for solid-primary surfaces
                  // elsewhere (see .edu-button-primary in globals.css).
                  "border-[var(--color-primary)] bg-[var(--color-primary)] text-[#07101a]"
                : "border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-primary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {showResults && (
        <div id={resultsId} aria-live="polite" className="mt-5">
          {results.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--color-border)] p-6 text-center">
              <p className="font-medium text-[var(--color-text)]">
                {t("edumatch.help.searchNoResultsTitle")}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                {t("edumatch.help.searchNoResultsBody")}
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {results.map((article) => (
                <li key={`${article.audience}-${article.slug}`}>
                  <HelpArticleCard
                    href={articleHref(article.slug, article.audience)}
                    title={article.title}
                    summary={article.summary}
                    audienceLabel={
                      article.audience === "tutor"
                        ? t("edumatch.help.audienceTutor")
                        : t("edumatch.help.audienceStudent")
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

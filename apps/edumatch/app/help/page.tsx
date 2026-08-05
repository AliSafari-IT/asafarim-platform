"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  AlertTriangle,
  BookOpenCheck,
  CreditCard,
  RefreshCw,
  Scale,
  ShieldCheck,
  UsersRound,
  Wrench,
} from "lucide-react";
import { HELP_ARTICLES, getArticlesForAudience, resolveArticles } from "@/lib/help-content";
import { HelpSearch } from "@/components/help/HelpSearch";
import { HelpCategoryCard } from "@/components/help/HelpCategoryCard";
import { HelpArticleCard } from "@/components/help/HelpArticleCard";

// "Popular" is the getting-started guide for each audience — the natural
// first click for someone who doesn't yet know EduMatch's structure.
const POPULAR_SLUGS: Array<{ slug: string; audience: "student" | "tutor" }> = [
  { slug: "getting-started", audience: "student" },
  { slug: "ask-a-question", audience: "student" },
  { slug: "getting-started", audience: "tutor" },
  { slug: "finding-and-quoting-requests", audience: "tutor" },
];

const TOPIC_TILES = [
  { key: "safety", icon: ShieldCheck, slug: "getting-started", audience: "student" as const },
  { key: "payments", icon: CreditCard, slug: "payments-and-settings", audience: "tutor" as const },
  { key: "cancellations", icon: RefreshCw, slug: "bookings-and-support", audience: "student" as const },
  { key: "disputes", icon: Scale, slug: "bookings-and-disputes", audience: "tutor" as const },
  { key: "troubleshooting", icon: Wrench, slug: "ask-a-question", audience: "student" as const },
];

export default function HelpHomePage() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const roles = session?.user?.roles ?? [];
  const isTutor = roles.includes("edumatch_tutor");
  const isStudent = roles.includes("edumatch_student");

  const resolved = resolveArticles(HELP_ARTICLES, t);
  const popular = POPULAR_SLUGS.map(({ slug, audience }) =>
    resolved.find((a) => a.slug === slug && a.audience === audience),
  ).filter((a): a is NonNullable<typeof a> => Boolean(a));

  const recommended = isTutor
    ? getArticlesForAudience("tutor").slice(0, 3)
    : isStudent
      ? getArticlesForAudience("student").slice(0, 3)
      : [];

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">{t("edumatch.help.title")}</h1>
        <p className="mt-2 text-[var(--color-text-muted)]">{t("edumatch.help.subtitle")}</p>
      </header>

      <div className="mx-auto mb-10 max-w-2xl">
        <HelpSearch />
      </div>

      {recommended.length > 0 && (
        <section aria-labelledby="help-recommended-heading" className="mb-10">
          <h2 id="help-recommended-heading" className="mb-1 text-lg font-semibold text-[var(--color-text)]">
            {t("edumatch.help.recommendedForYou")}
          </h2>
          <p className="mb-3 text-sm text-[var(--color-text-muted)]">
            {t(isTutor ? "edumatch.help.recommendedTutor" : "edumatch.help.recommendedStudent")}
          </p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {recommended.map((a) => (
              <li key={`${a.audience}-${a.slug}`}>
                <HelpArticleCard
                  href={`${a.audience === "tutor" ? "/help/tutors" : "/help/students"}/${a.slug}`}
                  title={t(a.titleKey)}
                  summary={t(a.summaryKey)}
                  audienceLabel={t(a.audience === "tutor" ? "edumatch.help.audienceTutor" : "edumatch.help.audienceStudent")}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="help-audiences-heading" className="mb-10">
        <h2 id="help-audiences-heading" className="sr-only">
          {t("edumatch.help.forStudentsTitle")} / {t("edumatch.help.forTutorsTitle")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HelpCategoryCard
            href="/help/students"
            icon={BookOpenCheck}
            title={t("edumatch.help.forStudentsTitle")}
            description={t("edumatch.help.forStudentsDesc")}
            emphasized
          />
          <HelpCategoryCard
            href="/help/tutors"
            icon={UsersRound}
            title={t("edumatch.help.forTutorsTitle")}
            description={t("edumatch.help.forTutorsDesc")}
            emphasized
          />
        </div>
      </section>

      <section aria-labelledby="help-popular-heading" className="mb-10">
        <h2 id="help-popular-heading" className="mb-3 text-lg font-semibold text-[var(--color-text)]">
          {t("edumatch.help.popularTitle")}
        </h2>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {popular.map((a) => (
            <li key={`${a.audience}-${a.slug}`}>
              <HelpArticleCard
                href={`${a.audience === "tutor" ? "/help/tutors" : "/help/students"}/${a.slug}`}
                title={a.title}
                summary={a.summary}
                audienceLabel={t(a.audience === "tutor" ? "edumatch.help.audienceTutor" : "edumatch.help.audienceStudent")}
              />
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="help-topics-heading">
        <h2 id="help-topics-heading" className="mb-3 text-lg font-semibold text-[var(--color-text)]">
          {t("edumatch.help.moreTopicsTitle")}
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TOPIC_TILES.map(({ key, icon, slug, audience }) => (
            <HelpCategoryCard
              key={key}
              href={`${audience === "tutor" ? "/help/tutors" : "/help/students"}/${slug}`}
              icon={key === "troubleshooting" ? AlertTriangle : icon}
              title={t(`edumatch.help.${key}Title`)}
              description={t(`edumatch.help.${key}Desc`)}
            />
          ))}
        </div>
      </section>

      <p className="mt-10 text-center text-sm text-[var(--color-text-subtle)]">
        <Link href="/help/students" className="underline hover:text-[var(--color-primary)]">
          {t("edumatch.help.viewAllStudent")}
        </Link>
        {" · "}
        <Link href="/help/tutors" className="underline hover:text-[var(--color-primary)]">
          {t("edumatch.help.viewAllTutor")}
        </Link>
      </p>
    </div>
  );
}

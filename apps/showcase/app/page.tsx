import { ButtonLink, Hero, Section } from "@asafarim/ui";
import { ProjectGalleryCard } from "./_components/ProjectGalleryCard";
import { cookies } from "next/headers";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../lib/i18n-dictionaries";
import { getProjects } from "./projects/data";

export default async function ShowcaseHomePage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const projects = getProjects((key) => t(key as any));

  return (
    <>
      <Hero
        kicker={t("showcase.home.hero.kicker")}
        kickerIndex="00"
        title={t("showcase.home.hero.title")}
        lede={t("showcase.home.hero.lede")}
        actions={
          <>
            <ButtonLink href="/projects">{t("showcase.home.hero.ctaPrimary")}</ButtonLink>
            <ButtonLink href="/labs" variant="secondary">
              {t("showcase.home.hero.ctaSecondary")}
            </ButtonLink>
          </>
        }
      />

      {/* The gallery is the "walk the wall" view: one card per piece, each
          offering its write-up and — when the project is actually deployed —
          the running app. The analysis (stacks, dependencies, architecture)
          lives on /projects so the two pages stop being the same grid twice. */}
      <Section kicker={t("showcase.home.featured.kicker")} kickerIndex="01" title={t("showcase.home.featured.title")}>
        <div className="ui-grid ui-grid--wide">
          {projects.map((project) => (
            <ProjectGalleryCard key={project.slug} project={project} />
          ))}
        </div>
      </Section>
    </>
  );
}

import { ButtonLink, Hero, ProjectCard, Section } from "@asafarim/ui";
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

      <Section kicker={t("showcase.home.featured.kicker")} kickerIndex="01" title={t("showcase.home.featured.title")}>
        <div className="ui-grid ui-grid--wide">
          {projects.map((project) => (
            <ProjectCard
              key={project.slug}
              title={project.title}
              summary={project.summary}
              href={`/projects/${project.slug}`}
              tags={project.tags}
              status={project.status}
              glyph={project.glyph}
              index={project.index}
            />
          ))}
        </div>
      </Section>
    </>
  );
}

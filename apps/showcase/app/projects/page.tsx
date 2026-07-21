import type { Metadata } from "next";
import { cookies } from "next/headers";
import { PageHeader, ProjectCard } from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../lib/i18n-dictionaries";
import { getProjects } from "./data";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const projects = getProjects((key) => t(key as any));

  return (
    <>
      <PageHeader
        kicker={t("showcase.projects.kicker")}
        kickerIndex="01"
        title={t("showcase.projects.title")}
        description={t("showcase.projects.description")}
      />
      <div className="ui-grid ui-grid--wide">
        {projects.map((project) => (
          <ProjectCard
            key={project.slug}
            title={project.title}
            summary={project.summary}
            href={project.externalUrl ?? `/projects/${project.slug}`}
            tags={project.tags}
            status={project.status}
            glyph={project.glyph}
            index={project.index}
          />
        ))}
      </div>
    </>
  );
}

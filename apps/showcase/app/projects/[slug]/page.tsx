import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  PageHeader,
  Panel,
  StatusBadge,
} from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../lib/i18n-dictionaries";
import { projects, getProject, getTranslatedProject } from "../data";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

// These slugs have their own richer static routes (e.g. /projects/testora),
// which take precedence over this dynamic segment — don't prerender them here.
const HAS_STATIC_ROUTE = new Set(["testora", "ai-eval", "edumatch", "vionto"]);

export function generateStaticParams() {
  return projects
    .filter((project) => !HAS_STATIC_ROUTE.has(project.slug))
    .map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  return { title: project?.title ?? "Project" };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;

  const cookieStore = await cookies();
  const locale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(locale, showcaseDictionaries);
  const project = getTranslatedProject((key) => t(key as any), slug);

  if (!project) {
    notFound();
  }

  return (
    <>
      <PageHeader
        kicker={`${t("showcase.project.exhibit")} ${project.index}`}
        title={project.title}
        description={project.summary}
        actions={<Link href="/projects">{t("showcase.project.back")}</Link>}
      />

      <div className="ui-grid">
        <Panel
          title={t("showcase.project.specSheet")}
          actions={<StatusBadge status={project.status} />}
        >
          <p className="u-mono" style={{ marginBottom: "0.75rem" }}>
            slug: {project.slug}
          </p>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            {project.tags.map((tag) => (
              <Badge key={tag} tone="info">
                {tag}
              </Badge>
            ))}
          </div>
        </Panel>
        <Card variant="gallery" title={t("showcase.project.caseStudy")}>
          {t("showcase.project.caseStudyBody")}
        </Card>
      </div>
    </>
  );
}

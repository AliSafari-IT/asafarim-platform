import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  PageHeader,
  Panel,
  Section,
  StatusBadge,
} from "@asafarim/ui";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../../../lib/i18n-dictionaries";
import { projects, getProject, getTranslatedProject, PLATFORM_ELEMENTS } from "../data";

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
            {project.stack.map((tech) => (
              <Badge key={tech} tone="info">
                {tech}
              </Badge>
            ))}
          </div>
          {project.externalUrl ? (
            <p style={{ marginTop: "1rem" }}>
              <a href={project.externalUrl} target="_blank" rel="noreferrer">
                Open the live app ↗
              </a>
            </p>
          ) : (
            <p style={{ marginTop: "1rem" }} className="u-muted">
              Not deployed yet.
            </p>
          )}
        </Panel>

        <Panel title="Built on">
          <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.7 }}>
            {project.dependsOn.map((id) => {
              const element = PLATFORM_ELEMENTS.find((candidate) => candidate.id === id);
              if (!element) return null;
              return (
                <li key={id}>
                  <strong>{element.name}</strong> <span className="u-mono">{element.package}</span>
                  <br />
                  <span className="u-muted">{element.blurb}</span>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <Section kicker="Detail" kickerIndex="01" title="What's notable">
        <ul style={{ margin: 0, paddingLeft: "1.1rem", lineHeight: 1.8, maxWidth: "48rem" }}>
          {project.highlights.map((highlight) => (
            <li key={highlight}>{highlight}</li>
          ))}
        </ul>
      </Section>

      <Section kicker="Next" kickerIndex="02" title={t("showcase.project.caseStudy")}>
        <Card variant="gallery" title={t("showcase.project.caseStudy")}>
          {t("showcase.project.caseStudyBody")}
        </Card>
      </Section>
    </>
  );
}

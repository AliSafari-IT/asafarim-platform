import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Badge,
  Card,
  PageHeader,
  Panel,
  StatusBadge,
} from "@asafarim/ui";
import { getProject, projects } from "../data";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  // `testora` has its own richer static route at /projects/testora, which takes
  // precedence over this dynamic segment — so don't prerender it here too.
  return projects
    .filter((project) => project.slug !== "testora")
    .map((project) => ({ slug: project.slug }));
}

export async function generateMetadata({ params }: ProjectPageProps): Promise<Metadata> {
  const { slug } = await params;
  const project = getProject(slug);
  return { title: project?.title ?? "Project" };
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { slug } = await params;
  const project = getProject(slug);

  if (!project) {
    notFound();
  }

  return (
    <>
      <PageHeader
        kicker={`Exhibit № ${project.index}`}
        title={project.title}
        description={project.summary}
        actions={<Link href="/projects">← Back to the wall</Link>}
      />

      <div className="ui-grid">
        <Panel
          title="Spec sheet"
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
        <Card variant="gallery" title="Case study">
          Full case study, screenshots, and a live demo link will be hung next
          to this piece when the showcase content is migrated.
        </Card>
      </div>
    </>
  );
}

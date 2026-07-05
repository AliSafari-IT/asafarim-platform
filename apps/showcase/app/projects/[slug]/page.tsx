import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@asafarim/ui";
import { getProject, projects } from "../data";

interface ProjectPageProps {
  params: Promise<{ slug: string }>;
}

export function generateStaticParams() {
  return projects.map((project) => ({ slug: project.slug }));
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
        title={project.title}
        description={project.summary}
        actions={
          <Link href="/projects" style={{ color: "#38bdf8" }}>
            ← All projects
          </Link>
        }
      />
      <Card title="Tech stack">
        <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
          {project.tags.map((tag) => (
            <Badge key={tag} tone="info">
              {tag}
            </Badge>
          ))}
        </p>
        <p>
          Full case study, screenshots, and live demo links will be migrated
          with the showcase content in a later PR.
        </p>
      </Card>
    </>
  );
}

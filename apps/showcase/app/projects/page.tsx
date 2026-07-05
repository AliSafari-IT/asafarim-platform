import type { Metadata } from "next";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@asafarim/ui";
import { projects } from "./data";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        title="Projects"
        description="Showcased projects from the ASafarIM ecosystem"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1rem",
        }}
      >
        {projects.map((project) => (
          <Link
            key={project.slug}
            href={`/projects/${project.slug}`}
            style={{ textDecoration: "none" }}
          >
            <Card title={project.title}>
              <p>{project.summary}</p>
              <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {project.tags.map((tag) => (
                  <Badge key={tag} tone="info">
                    {tag}
                  </Badge>
                ))}
              </p>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}

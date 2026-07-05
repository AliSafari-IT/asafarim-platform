import type { Metadata } from "next";
import { PageHeader, ProjectCard } from "@asafarim/ui";
import { projects } from "./data";

export const metadata: Metadata = { title: "Projects" };

export default function ProjectsPage() {
  return (
    <>
      <PageHeader
        kicker="Gallery"
        kickerIndex="01"
        title="Projects"
        description="Every piece on the wall — tech stacks, statuses, and case studies."
      />
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
    </>
  );
}

import type { Metadata } from "next";
import {
  Badge,
  Card,
  PageHeader,
  Section,
  StatusBadge,
  getPlatformLinks,
} from "@asafarim/ui";
import { projectGroups } from "../../content/projects";

export const metadata: Metadata = {
  title: "Projects",
  description:
    "The project wall of ASafarIM Digital: the platform itself, products like Vionto and EduMatch, showcase apps like Testora and SmartOps, and open-source npm packages.",
};

export default function ProjectsPage() {
  const links = getPlatformLinks();

  return (
    <>
      <PageHeader
        kicker="The wall"
        kickerIndex="03"
        title="Projects"
        description="A curated wall of platform work, products, demos, and open source. Live demos hang in the Showcase."
        actions={<a href={links.showcase}>Visit the Showcase →</a>}
      />

      {projectGroups.map((group, i) => (
        <Section
          key={group.title}
          kicker={group.kicker}
          kickerIndex={String(i + 1).padStart(2, "0")}
          title={group.title}
        >
          <p className="u-muted" style={{ maxWidth: "42rem" }}>
            {group.intro}
          </p>
          <div className="ui-grid">
            {group.projects.map((project) => (
              <Card key={project.name} variant="elevated" title={project.name}>
                <p>
                  <StatusBadge status={project.status} />
                </p>
                <p>{project.description}</p>
                <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                  {project.tech.map((tech) => (
                    <Badge key={tech} tone="info">
                      {tech}
                    </Badge>
                  ))}
                </p>
                {project.href ? (
                  <a href={project.href} target="_blank" rel="noreferrer">
                    Visit →
                  </a>
                ) : null}
              </Card>
            ))}
          </div>
        </Section>
      ))}
    </>
  );
}

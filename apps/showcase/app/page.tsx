import { ButtonLink, Hero, ProjectCard, Section } from "@asafarim/ui";
import { projects } from "./projects/data";

export default function ShowcaseHomePage() {
  return (
    <>
      <Hero
        kicker="The exhibition"
        kickerIndex="00"
        title="Curated projects from the ASafarIM Digital lab."
        lede="Demos, case studies, and experiments — each piece on this wall is real software you can inspect and try."
        actions={
          <>
            <ButtonLink href="/projects">Walk the gallery</ButtonLink>
            <ButtonLink href="/labs" variant="secondary">
              Peek into Labs
            </ButtonLink>
          </>
        }
      />

      <Section kicker="On display" kickerIndex="01" title="Featured pieces">
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

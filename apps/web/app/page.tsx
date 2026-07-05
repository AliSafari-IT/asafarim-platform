import {
  Badge,
  ButtonLink,
  Card,
  Hero,
  Metric,
  Section,
  StatusBadge,
  getPlatformLinks,
} from "@asafarim/ui";
import { site } from "../content/site";
import { featuredProjects } from "../content/projects";
import { services } from "../content/services";

export default function HomePage() {
  const links = getPlatformLinks();
  const previewServices = services.slice(0, 3);

  return (
    <>
      <Hero
        kicker={site.hero.kicker}
        kickerIndex="00"
        title={site.hero.title}
        lede={site.hero.lede}
        actions={
          <>
            <ButtonLink href={links.showcase}>Explore the Showcase</ButtonLink>
            <ButtonLink href={links.hub} variant="secondary">
              Open the Hub
            </ButtonLink>
          </>
        }
      />

      <div className="ui-grid ui-grid--metrics">
        {site.stats.map((stat) => (
          <Metric key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <Section kicker="The studio" kickerIndex="01" title={site.intro.heading}>
        <p className="u-muted" style={{ maxWidth: "42rem" }}>
          {site.intro.body}
        </p>
        <p>
          <a href="/about">More about the studio →</a>
        </p>
      </Section>

      <Section kicker="From the workbench" kickerIndex="02" title="What gets made here">
        <div className="ui-grid">
          {previewServices.map((service) => (
            <Card key={service.title} variant="studio" title={service.title}>
              <p>{service.body}</p>
              <span className="u-mono">{service.note}</span>
            </Card>
          ))}
        </div>
        <p style={{ marginTop: "var(--space-5)" }}>
          <a href="/services">All services →</a>
        </p>
      </Section>

      <Section kicker="On the wall" kickerIndex="03" title="Selected projects">
        <div className="ui-grid">
          {featuredProjects.map((project) => (
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
            </Card>
          ))}
        </div>
        <p style={{ marginTop: "var(--space-5)" }}>
          <a href="/projects">The whole wall →</a>
        </p>
      </Section>

      <Section kicker="The platform" kickerIndex="04" title={site.platform.heading}>
        <p className="u-muted" style={{ maxWidth: "42rem" }}>
          {site.platform.body}
        </p>
        <div className="ui-grid">
          {site.platform.items.map((item) => (
            <Card key={item.title} title={item.title}>
              {item.text}
            </Card>
          ))}
        </div>
      </Section>

      <Section kicker="Get in touch" kickerIndex="05" title="Have something practical in mind?">
        <p className="u-muted" style={{ maxWidth: "38rem" }}>
          {site.contact.availability}. {site.contact.responseTime}.
        </p>
        <ButtonLink href="/contact">Start a conversation</ButtonLink>
      </Section>
    </>
  );
}

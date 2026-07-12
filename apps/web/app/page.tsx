import type { Metadata } from "next";
import {
  Badge,
  ButtonLink,
  Card,
  Hero,
  Kicker,
  Metric,
  PipelineDiagram,
  PlatformMap,
  Section,
  Timeline,
  getPlatformLinks,
} from "@asafarim/ui";
import { site } from "../content/site";
import { evidenceRail, workByProblem } from "../content/evidence";
import { aiEvalCard, eduMatchCard, viontoCard, viontoPipelineStages } from "../content/benchmark";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

export default function HomePage() {
  const links = getPlatformLinks();

  return (
    <>
      <Hero
        kicker={site.hero.kicker}
        kickerIndex="00"
        title={site.hero.title}
        lede={site.hero.lede}
        actions={
          <>
            <ButtonLink href="/projects">See the evidence</ButtonLink>
            <ButtonLink href="/contact" variant="secondary">
              Start a conversation
            </ButtonLink>
          </>
        }
      />

      <p style={{ marginTop: "calc(var(--space-7) * -1)", marginBottom: "var(--space-6)" }}>
        <Kicker>{site.now.label}</Kicker>
        <span className="u-muted"> {site.now.text}</span>
      </p>

      <div className="ui-grid ui-grid--metrics">
        {site.stats.map((stat) => (
          <Metric key={stat.label} label={stat.label} value={stat.value} />
        ))}
      </div>

      <Section kicker="Evidence" kickerIndex="01" title="Shipped, not slideware">
        <div className="ui-grid ui-grid--wide">
          {evidenceRail.map((item) => (
            <Card key={item.id} variant="elevated" title={item.claim}>
              <p>{item.result}</p>
              <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {item.technologies.map((tech) => (
                  <Badge key={tech} tone="info">
                    {tech}
                  </Badge>
                ))}
              </p>
              <p className="u-mono">
                {item.date} · {item.proofType}
                {item.confidentiality === "described" ? " · described from experience" : ""}
              </p>
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer">
                  {item.linkLabel ?? "Public proof"} →
                </a>
              ) : null}
            </Card>
          ))}
        </div>
      </Section>

      <Section kicker="Selected work" kickerIndex="02" title="Problems solved, not tech demos">
        <div className="ui-grid ui-grid--wide">
          {workByProblem.map((item) => (
            <Card key={item.problem} variant="studio" title={item.problem}>
              <p>{item.solution}</p>
              <p>
                <strong>Result:</strong> {item.result}
              </p>
              <p style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap" }}>
                {item.technologies.map((tech) => (
                  <Badge key={tech} tone="info">
                    {tech}
                  </Badge>
                ))}
              </p>
              {item.link ? (
                <a href={item.link} target="_blank" rel="noreferrer">
                  {item.linkLabel ?? "View"} →
                </a>
              ) : (
                <span className="u-mono">described from experience</span>
              )}
            </Card>
          ))}
        </div>
        <p style={{ marginTop: "var(--space-5)" }}>
          <a href="/projects">The full project wall →</a>
        </p>
      </Section>

      <Section kicker="Benchmark" kickerIndex="03" title="Reproducible evaluation, not tech demos">
        <div className="ui-grid ui-grid--wide">
          {[aiEvalCard, eduMatchCard].map((card) => (
            <Card key={card.title} variant="elevated" title={card.title}>
              <p>{card.blurb}</p>
              <div
                className="ui-grid ui-grid--metrics"
                style={{ margin: "var(--space-4) 0" }}
              >
                {card.stats.map((stat) => (
                  <Metric key={stat.label} label={stat.label} value={stat.value} />
                ))}
              </div>
              <p className="u-mono">{card.note}</p>
              <a href={`${links.showcase}${card.href}`}>{card.linkLabel} →</a>
            </Card>
          ))}
          <Card variant="elevated" title={viontoCard.title}>
            <p>{viontoCard.blurb}</p>
            <div style={{ margin: "var(--space-4) 0" }}>
              <PipelineDiagram stages={[...viontoPipelineStages]} />
            </div>
            <div
              className="ui-grid ui-grid--metrics"
              style={{ margin: "var(--space-4) 0" }}
            >
              {viontoCard.stats.map((stat) => (
                <Metric key={stat.label} label={stat.label} value={stat.value} />
              ))}
            </div>
            <p className="u-mono">{viontoCard.note}</p>
            <a href={`${links.showcase}${viontoCard.href}`}>{viontoCard.linkLabel} →</a>
          </Card>
        </div>
      </Section>

      <Section kicker="The platform" kickerIndex="04" title={site.platformMap.heading}>
        <p className="u-muted" style={{ maxWidth: "42rem" }}>
          {site.platformMap.body}
        </p>
        <PlatformMap
          center={site.platformMap.center}
          nodes={site.platformMap.nodes.map((node) => ({
            ...node,
            href:
              node.name === "Hub"
                ? links.hub
                : node.name === "Showcase"
                  ? links.showcase
                  : node.name === "Admin"
                    ? links.admin
                    : undefined,
          }))}
        />
      </Section>

      <Section kicker="Principles" kickerIndex="05" title="How things get built">
        <div className="ui-grid">
          {site.principles.map((principle) => (
            <Card key={principle.title} title={principle.title}>
              {principle.body}
            </Card>
          ))}
        </div>
      </Section>

      <Section kicker="Timeline" kickerIndex="06" title="From river models to production software">
        <Timeline items={[...site.timeline]} />
      </Section>

      <Section kicker="Get in touch" kickerIndex="07" title="Have something practical in mind?">
        <p className="u-muted" style={{ maxWidth: "38rem" }}>
          Available for full-stack and AI application engineering: technical
          leadership, platform architecture, or hands-on product work.{" "}
          {site.contact.responseTime}.
        </p>
        <ButtonLink href="/contact">Start a conversation</ButtonLink>
      </Section>
    </>
  );
}

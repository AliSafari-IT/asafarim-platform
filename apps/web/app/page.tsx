import {
  ButtonLink,
  Card,
  Hero,
  Section,
  StatusBadge,
  getPlatformLinks,
} from "@asafarim/ui";

export default function HomePage() {
  const links = getPlatformLinks();

  return (
    <>
      <Hero
        kicker="A digital studio"
        kickerIndex="00"
        title="Practical digital products, designed and built end to end."
        lede="ASafarIM Digital is a one-person product lab: web platforms, developer tools, and experiments — taken from first sketch to running software."
        actions={
          <>
            <ButtonLink href={links.showcase}>Explore the Showcase</ButtonLink>
            <ButtonLink href={links.hub} variant="secondary">
              Open the Hub
            </ButtonLink>
          </>
        }
      />

      <Section kicker="From the workbench" kickerIndex="01" title="What gets made here">
        <div className="ui-grid">
          <Card variant="studio" title="Web platforms">
            Full-stack applications with Next.js, TypeScript, and PostgreSQL —
            the same stack this platform runs on.
          </Card>
          <Card variant="studio" title="Tools & automations">
            Small, sharp utilities that remove friction: generators, dashboards,
            and pipelines.
          </Card>
          <Card variant="studio" title="Experiments">
            Ideas tested in the open. The promising ones graduate into products;
            the rest teach something.
          </Card>
        </div>
      </Section>

      <Section kicker="On the wall" kickerIndex="02" title="Currently exhibited">
        <div className="ui-grid">
          <Card variant="elevated" title="ASafarIM Platform">
            <p>
              <StatusBadge status="live" />
            </p>
            The monorepo powering this site, the Hub, the Showcase, and the
            Admin console — one deploy, one identity, many apps.
          </Card>
          <Card variant="elevated" title="Task Management">
            <p>
              <StatusBadge status="beta" />
            </p>
            An end-to-end task vertical with its own API and client, on display
            in the Showcase.
          </Card>
          <Card variant="elevated" title="Testora">
            <p>
              <StatusBadge status="beta" />
            </p>
            An E2E test console that orchestrates runs and streams results
            live.
          </Card>
        </div>
        <p style={{ marginTop: "var(--space-5)" }}>
          <a href="/projects">See all projects →</a>
        </p>
      </Section>

      <Section kicker="Get in touch" kickerIndex="03" title="Have something practical in mind?">
        <p className="u-muted" style={{ maxWidth: "38rem" }}>
          The studio takes on selected client work: platforms, integrations, and
          deployments that need to actually ship.
        </p>
        <ButtonLink href="/contact">Start a conversation</ButtonLink>
      </Section>
    </>
  );
}

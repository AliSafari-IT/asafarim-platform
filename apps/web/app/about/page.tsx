import type { Metadata } from "next";
import { Card, Kicker, PageHeader, Section } from "@asafarim/ui";
import { site } from "../../content/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "ASafarIM Digital is the personal digital studio of Ali Safari — full-stack developer in Hasselt, Belgium, with a research background in engineering hydrology.",
};

export default function AboutPage() {
  return (
    <>
      <PageHeader
        kicker="The studio"
        kickerIndex="01"
        title="About ASafarIM Digital"
        description={site.about.lede}
      />

      <Section>
        <div className="ui-grid">
          {site.about.story.map((chapter) => (
            <Card key={chapter.title} variant="studio" title={chapter.title}>
              {chapter.body}
            </Card>
          ))}
        </div>
      </Section>

      <Section kicker="How things get built" kickerIndex="02" title="The craft">
        <Card variant="elevated">
          <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 2 }}>
            {site.about.craft.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Card>
      </Section>

      <Section kicker="Practical details" kickerIndex="03">
        <div style={{ display: "flex", gap: "2rem", flexWrap: "wrap" }}>
          <div>
            <Kicker>Based in</Kicker>
            <p>{site.contact.location}</p>
          </div>
          <div>
            <Kicker>Availability</Kicker>
            <p>{site.contact.availability}</p>
          </div>
          <div>
            <Kicker>Open source</Kicker>
            <p>
              <a href={site.contact.github} target="_blank" rel="noreferrer">
                github.com/AliSafari-IT
              </a>
            </p>
          </div>
        </div>
      </Section>
    </>
  );
}

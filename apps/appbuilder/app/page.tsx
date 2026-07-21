import type { Metadata } from "next";
import { ButtonLink, Card, Hero, PageHeader, Section } from "@asafarim/ui";

export const metadata: Metadata = { title: "Overview" };

export default function HomePage() {
  return (
    <>
      <Hero
        kicker="AppBuilder"
        title="Describe an app. Get a controlled, previewable application back."
        lede="AppBuilder turns a plain-language description of an internal business tool into a versioned application specification — previewed, refined conversationally, validated, and published as an immutable release."
        actions={
          <>
            <ButtonLink href="/apps">View apps</ButtonLink>
            <ButtonLink href="/apps/new" variant="secondary">
              Start a new app
            </ButtonLink>
          </>
        }
      />

      <Section>
        <PageHeader
          kicker="How it works"
          kickerIndex="01"
          title="A metadata-driven runtime, not generated code"
          description="Every generated app is a versioned specification interpreted by one shared, platform-owned runtime — never a folder of AI-written source files. See the architecture decision for the full trust-boundary rationale."
        />
        <div className="ui-grid">
          <Card>
            <h3>No arbitrary server code</h3>
            <p>
              Business logic is limited to bounded workflow primitives the
              specification format defines — never a free-form script or
              handler.
            </p>
          </Card>
          <Card>
            <h3>No arbitrary npm packages</h3>
            <p>
              A generated app&apos;s behavior is fully determined by the
              runtime&apos;s own dependency tree. Nothing in a specification
              can name or load a package.
            </p>
          </Card>
          <Card>
            <h3>Scoped by owner and app</h3>
            <p>
              Every generated-app query is scoped by both the authenticated
              owner/tenant and the app id, isolated from the platform&apos;s
              own database.
            </p>
          </Card>
        </div>
      </Section>
    </>
  );
}

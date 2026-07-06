import type { Metadata } from "next";
import {
  Alert,
  Button,
  Card,
  FormRow,
  Input,
  Kicker,
  Label,
  PageHeader,
  Textarea,
} from "@asafarim/ui";
import { site } from "../../content/site";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact ASafarIM Digital about full-stack web applications, APIs, dashboards, deployments, or data-driven software. Replies within 24–48 hours.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  return (
    <>
      <PageHeader
        kicker="Open door"
        kickerIndex="04"
        title="Start a conversation"
        description="Have a project in mind? Describe it briefly — you will hear back within 24–48 hours."
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(19rem, 1fr))",
          gap: "var(--space-5)",
          alignItems: "start",
        }}
      >
        <Card variant="studio" title="Project inquiry">
          <Alert tone="info">
            The form is visual for now — submissions are wired to the platform
            database in an upcoming phase. Until then, email{" "}
            <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>{" "}
            directly.
          </Alert>
          <form aria-label="Project inquiry (preview)">
            <FormRow>
              <Label htmlFor="name">Your name</Label>
              <Input id="name" name="name" type="text" autoComplete="name" disabled />
            </FormRow>
            <FormRow>
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" disabled />
            </FormRow>
            <FormRow>
              <Label htmlFor="message">Project details</Label>
              <Textarea
                id="message"
                name="message"
                placeholder="What are you building, roughly when, and what does done look like?"
                disabled
              />
            </FormRow>
            <Button type="button" disabled>
              Send message (coming soon)
            </Button>
          </form>
        </Card>

        <div>
          <Card title="Direct contact">
            <p>
              <a href={`mailto:${site.contact.email}`}>{site.contact.email}</a>
            </p>
            <p>{site.contact.location}</p>
            <p>{site.contact.availability}</p>
            <span className="u-mono">{site.contact.responseTime.toLowerCase()}</span>
          </Card>
          <div style={{ marginTop: "var(--space-5)" }}>
            <Kicker>Good fits</Kicker>
            <ul style={{ margin: 0, paddingLeft: "1.2rem", lineHeight: 2 }}>
              {site.contact.projectTypes.map((type) => (
                <li key={type}>{type}</li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

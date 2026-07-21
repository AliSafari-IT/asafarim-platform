import type { Metadata } from "next";
import { auth } from "@asafarim/auth";
import { prisma } from "@asafarim/db";
import { Card, Kicker, PageHeader } from "@asafarim/ui";
import { site } from "../../content/site";
import { ContactForm } from "./ContactForm";
import { ContactWorkspace } from "./ContactWorkspace";
import type { InboxMessage } from "./types";

export const metadata: Metadata = {
  title: "Contact",
  description:
    "Contact ASafarIM Digital about full-stack web applications, APIs, dashboards, deployments, or data-driven software. Replies within 24–48 hours.",
  alternates: { canonical: "/contact" },
};

// Signed-in users get a live inbox, so the page must never be statically cached.
export const dynamic = "force-dynamic";

function DirectContact() {
  return (
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
  );
}

export default async function ContactPage() {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    // Anonymous visitors — the plain email form is enough.
    return (
      <>
        <PageHeader
          kicker="Open door"
          kickerIndex="04"
          title="Start a conversation"
          description="Have a project in mind? Describe it briefly — you will hear back within 24–48 hours. Sign in to attach files and keep a tracked copy in your inbox."
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
            <ContactForm />
          </Card>
          <DirectContact />
        </div>
      </>
    );
  }

  const rows = await prisma.contactMessage.findMany({
    where: { userId },
    include: { attachments: { orderBy: { createdAt: "asc" } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const messages: InboxMessage[] = rows.map((m) => ({
    id: m.id,
    subject: m.subject,
    bodyHtml: m.bodyHtml,
    bodyText: m.bodyText,
    status: m.status,
    emailSent: m.emailSent,
    createdAt: m.createdAt.toISOString(),
    attachments: m.attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      contentType: a.contentType,
      sizeBytes: a.sizeBytes,
    })),
  }));

  return (
    <>
      <PageHeader
        kicker="Your inbox"
        kickerIndex="04"
        title="Messages & contact"
        description="Compose a message with rich HTML and attachments, keep a tracked copy here, and download your files any time."
      />
      <div style={{ display: "grid", gap: "var(--space-5)" }}>
        <Card variant="studio" title="Contact inbox">
          <ContactWorkspace
            initialMessages={messages}
            userName={session.user.name?.trim() || session.user.email || "you"}
            userEmail={session.user.email ?? ""}
          />
        </Card>
        <DirectContact />
      </div>
    </>
  );
}

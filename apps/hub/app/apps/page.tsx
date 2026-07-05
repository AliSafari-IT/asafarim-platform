import type { Metadata } from "next";
import { requireUser, hasRole, ROLES } from "@asafarim/auth";
import { Card, getPlatformLinks } from "@asafarim/ui";
import { PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Apps" };

export default async function AppsPage() {
  const session = await requireUser({ callbackUrl: "/apps" });
  const links = getPlatformLinks();
  const isAdminUser = hasRole(session, [ROLES.ADMIN]);

  const apps = [
    {
      title: "ASafarIM Digital",
      body: "The public company website.",
      href: links.web,
    },
    {
      title: "Showcase",
      body: "Public demos, projects, and experiments.",
      href: links.showcase,
    },
    ...(isAdminUser
      ? [
          {
            title: "Admin",
            body: "User, role, and content management (admin only).",
            href: links.admin,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Apps"
        description="Launch any app in the ASafarIM Platform"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          gap: "1rem",
        }}
      >
        {apps.map((app) => (
          <a key={app.href} href={app.href} style={{ textDecoration: "none" }}>
            <Card title={app.title}>{app.body}</Card>
          </a>
        ))}
      </div>
    </>
  );
}

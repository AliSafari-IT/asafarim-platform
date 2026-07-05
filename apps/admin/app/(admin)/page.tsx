import { Card, PageHeader } from "@asafarim/ui";

const sections = [
  { title: "Users", body: "Manage user accounts, activation, and profiles.", href: "/users" },
  { title: "Roles", body: "Define roles and assign them to users.", href: "/roles" },
  { title: "Permissions", body: "Review the permission catalog per group.", href: "/permissions" },
  { title: "Audit Logs", body: "Trace administrative and security events.", href: "/audit-logs" },
  { title: "Settings", body: "Platform-wide configuration.", href: "/settings" },
];

export default function AdminOverviewPage() {
  return (
    <>
      <PageHeader
        title="Admin Overview"
        description="Manage users, roles, permissions, and platform settings"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(16rem, 1fr))",
          gap: "1rem",
        }}
      >
        {sections.map((section) => (
          <a key={section.href} href={section.href} style={{ textDecoration: "none" }}>
            <Card title={section.title}>{section.body}</Card>
          </a>
        ))}
      </div>
    </>
  );
}

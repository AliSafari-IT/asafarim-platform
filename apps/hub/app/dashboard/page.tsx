import type { Metadata } from "next";
import { requireUser } from "@asafarim/auth";
import { Badge, Card, PageHeader } from "@asafarim/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await requireUser({ callbackUrl: "/dashboard" });

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Overview of your account and activity"
      />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(18rem, 1fr))",
          gap: "1rem",
        }}
      >
        <Card title="Your session">
          <p>Name: {session.user.name ?? "—"}</p>
          <p>Email: {session.user.email}</p>
          <p>Username: {session.user.username ?? "—"}</p>
          <p>
            Roles:{" "}
            {session.user.roles.length > 0
              ? session.user.roles.map((role) => (
                  <span key={role} style={{ marginRight: "0.3rem" }}>
                    <Badge tone="info">{role}</Badge>
                  </span>
                ))
              : "none"}
          </p>
        </Card>
        <Card title="Activity">
          Recent activity and notifications will appear here once the
          corresponding features are migrated.
        </Card>
      </div>
    </>
  );
}

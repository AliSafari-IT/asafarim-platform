import { requireUser } from "@asafarim/auth";
import { AppShell, Card } from "@asafarim/ui";

export default async function DashboardPage() {
  const session = await requireUser({ callbackUrl: "/dashboard" });

  return (
    <AppShell appName="Hub">
      <h1>Dashboard</h1>
      <Card title="Your session">
        <p>User ID: {session.user.id}</p>
        <p>Name: {session.user.name ?? "—"}</p>
        <p>Email: {session.user.email}</p>
        <p>Username: {session.user.username ?? "—"}</p>
        <p>Roles: {session.user.roles.join(", ") || "none"}</p>
        <p>Active: {session.user.isActive ? "yes" : "no"}</p>
      </Card>
    </AppShell>
  );
}

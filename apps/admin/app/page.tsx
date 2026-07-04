import { AppShell, Card } from "@asafarim/ui";

export default function AdminPage() {
  return (
    <AppShell appName="Admin">
      <h1>ASafarIM Admin</h1>
      <Card title="apps/admin">
        Admin panel placeholder. This app will manage users, roles, showcase
        items, apps, contact messages, and system settings behind role-based
        authentication, served at admin.asafarim.com.
      </Card>
    </AppShell>
  );
}

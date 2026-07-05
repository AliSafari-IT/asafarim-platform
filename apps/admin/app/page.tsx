import { requireRole, ROLES, signOut } from "@asafarim/auth";
import { AppShell, Button, Card } from "@asafarim/ui";

export default async function AdminPage() {
  const session = await requireRole([ROLES.ADMIN]);

  return (
    <AppShell appName="Admin">
      <h1>ASafarIM Admin</h1>
      <Card title="Admin access granted">
        <p>
          Signed in as <strong>{session.user.name ?? session.user.email}</strong>{" "}
          ({session.user.roles.join(", ")})
        </p>
        <p>
          This panel will manage users, roles, showcase items, apps, contact
          messages, and system settings.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/sign-in" });
          }}
        >
          <Button type="submit">Sign out</Button>
        </form>
      </Card>
    </AppShell>
  );
}

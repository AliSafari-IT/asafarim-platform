import { auth } from "@asafarim/auth";
import { AppShell, Card } from "@asafarim/ui";

export default async function DeniedPage() {
  const session = await auth();

  return (
    <AppShell appName="Admin">
      <h1>Access denied</h1>
      <Card title="Admin role required">
        <p>
          {session?.user
            ? `Your account (${session.user.email}) does not have the admin role.`
            : "You are not signed in."}
        </p>
        <p>Contact a platform administrator if you believe this is a mistake.</p>
      </Card>
    </AppShell>
  );
}

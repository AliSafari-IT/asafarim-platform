import Link from "next/link";
import { auth, signOut } from "@asafarim/auth";
import { AppShell, Button, Card } from "@asafarim/ui";

export default async function HubPage() {
  const session = await auth();

  return (
    <AppShell appName="Hub">
      <h1>ASafarIM Hub</h1>
      {session?.user ? (
        <Card title="Signed in">
          <p>
            Welcome, <strong>{session.user.name ?? session.user.email}</strong>
          </p>
          <p>Email: {session.user.email}</p>
          <p>Username: {session.user.username ?? "—"}</p>
          <p>Roles: {session.user.roles.join(", ") || "none"}</p>
          <p style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <Link href="/dashboard" style={{ color: "#38bdf8" }}>
              Go to dashboard
            </Link>
          </p>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <Button type="submit">Sign out</Button>
          </form>
        </Card>
      ) : (
        <Card title="Not signed in">
          <p>You are not signed in.</p>
          <p>
            <Link href="/sign-in" style={{ color: "#38bdf8" }}>
              Sign in
            </Link>{" "}
            to access your dashboard.
          </p>
        </Card>
      )}
    </AppShell>
  );
}

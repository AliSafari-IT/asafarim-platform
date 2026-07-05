import Link from "next/link";
import { auth } from "@asafarim/auth";
import { Card, PageHeader } from "@asafarim/ui";

export default async function HubHomePage() {
  const session = await auth();

  return (
    <>
      <PageHeader
        title="ASafarIM Hub"
        description="Your central place for apps, tools, and account settings"
      />
      {session?.user ? (
        <Card title={`Welcome back, ${session.user.name ?? session.user.email}`}>
          <p>
            Head to your <Link href="/dashboard" style={{ color: "#38bdf8" }}>dashboard</Link>{" "}
            or open the <Link href="/apps" style={{ color: "#38bdf8" }}>app launcher</Link>.
          </p>
        </Card>
      ) : (
        <Card title="Not signed in">
          <p>
            <Link href="/sign-in" style={{ color: "#38bdf8" }}>
              Sign in
            </Link>{" "}
            to access your dashboard, apps, and settings.
          </p>
        </Card>
      )}
    </>
  );
}

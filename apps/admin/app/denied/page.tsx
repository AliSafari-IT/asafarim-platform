import { auth } from "@asafarim/auth";
import { Card, getPlatformLinks } from "@asafarim/ui";

export default async function DeniedPage() {
  const session = await auth();
  const links = getPlatformLinks();

  return (
    <div style={{ maxWidth: "28rem", margin: "3rem auto", padding: "0 1rem" }}>
      <h1 style={{ color: "#f1f5f9" }}>Access denied</h1>
      <Card title="Admin role required">
        <p>
          {session?.user
            ? `Your account (${session.user.email}) does not have the admin role.`
            : "You are not signed in."}
        </p>
        <p>
          Contact a platform administrator if you believe this is a mistake, or{" "}
          <a href={links.hub} style={{ color: "#38bdf8" }}>
            return to the Hub
          </a>
          .
        </p>
      </Card>
    </div>
  );
}

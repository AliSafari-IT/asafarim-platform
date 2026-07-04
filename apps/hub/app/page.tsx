import { AppShell, Card } from "@asafarim/ui";

export default function HubPage() {
  return (
    <AppShell appName="Hub">
      <h1>ASafarIM Hub</h1>
      <Card title="apps/hub">
        Dashboard placeholder. This app will hold the login redirect, user
        dashboard, profile, app launcher, and account settings, served at
        hub.asafarim.com.
      </Card>
    </AppShell>
  );
}

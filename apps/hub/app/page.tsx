import { auth } from "@asafarim/auth";
import { ButtonLink, Card, Hero } from "@asafarim/ui";

export default async function HubHomePage() {
  const session = await auth();

  if (session?.user) {
    return (
      <Hero
        kicker="Mission control"
        kickerIndex="00"
        title={`Welcome back, ${session.user.name ?? session.user.email}.`}
        lede="Your workspace for apps, showcases, and experiments — everything in the ASafarIM ecosystem launches from here."
        actions={
          <>
            <ButtonLink href="/dashboard">Open dashboard</ButtonLink>
            <ButtonLink href="/apps" variant="secondary">
              App launcher
            </ButtonLink>
          </>
        }
      />
    );
  }

  return (
    <>
      <Hero
        kicker="Mission control"
        kickerIndex="00"
        title="One sign-in. Every ASafarIM app."
        lede="The Hub is the logged-in heart of the platform: launch apps, manage your identity, and keep your settings in one place."
        actions={<ButtonLink href="/sign-in">Sign in to the Hub</ButtonLink>}
      />
      <div className="ui-grid">
        <Card title="Launchpad">
          Every platform app — website, showcase, admin — one grid, one click.
        </Card>
        <Card title="Identity">
          A single account with roles and permissions shared across all
          ASafarIM apps.
        </Card>
        <Card title="Control">
          Profile and preferences managed once, respected everywhere.
        </Card>
      </div>
    </>
  );
}

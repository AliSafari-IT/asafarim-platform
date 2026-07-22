import Link from "next/link";
import { auth, signOut } from "@asafarim/auth";
import {
  AppSwitcher,
  BrandWordmark,
  Button,
  ButtonLink,
  LogoMark,
  UserMenu,
  getPlatformLinks,
} from "@asafarim/ui";

/**
 * The shared platform header — same brand mark, app-switcher and user-menu
 * dropdowns used across web/hub/showcase/admin, so testora reads as part of
 * the ASafarIM platform. Server component: reads the SSO session directly and
 * signs out via a server action. testora keeps its own tool sidebar below this.
 */
export async function PlatformHeader() {
  const session = await auth();
  const links = getPlatformLinks();
  const signInUrl = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.testora}/`)}`;

  return (
    <header className="ui-shell__header">
      <Link href="/" className="ui-shell__brand">
        <LogoMark accent />
        <BrandWordmark product="Testora" />
      </Link>
      <div className="ui-shell__nav" />
      <div className="ui-shell__actions">
        <AppSwitcher
          links={[
            { label: "ASafarIM Digital", href: links.web, meta: "site" },
            { label: "Hub", href: links.hub, meta: session?.user ? "workspace" : "sign in" },
            { label: "Showcase", href: links.showcase, meta: "gallery" },
            { label: "Vionto", href: links.vionto, meta: "studio" },
            { label: "AppBuilder", href: links.appbuilder, meta: "builder" },
          ]}
        />
        {session?.user ? (
          <UserMenu
            name={session.user.name}
            email={session.user.email}
            image={session.user.image}
            roles={session.user.roles}
            profileHref={`${links.hub}/profile`}
          >
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <Button type="submit" variant="secondary" size="sm">
                Sign out
              </Button>
            </form>
          </UserMenu>
        ) : (
          <ButtonLink href={signInUrl} size="sm">
            Sign in
          </ButtonLink>
        )}
      </div>
    </header>
  );
}

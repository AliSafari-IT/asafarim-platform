import Link from "next/link";
import { auth, signOut, getAppSwitcherApps } from "@asafarim/auth";
import {
  AppSwitcher,
  BrandWordmark,
  Button,
  ButtonLink,
  LogoMark,
  MenuOutsideClick,
  UserMenu,
  getPlatformLinks,
  toAppSwitcherLinks,
} from "@asafarim/ui";
import { ThemeToggle } from "@asafarim/theme-toggle";

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
    <>
    <MenuOutsideClick />
    <header className="ui-shell__header">
      <Link href="/" className="ui-shell__brand">
        <LogoMark accent />
        <BrandWordmark product="Testora" />
      </Link>
      <div className="ui-shell__nav" />
      <div className="ui-shell__actions">
        <ThemeToggle />
        <AppSwitcher
          links={toAppSwitcherLinks(
            getAppSwitcherApps("testora", {
              roles: session?.user?.roles ?? [],
              authenticated: Boolean(session?.user),
            }),
            links
          )}
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
    </>
  );
}

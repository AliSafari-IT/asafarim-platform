import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth, signOut, PLATFORM_APPS, canAccessApp, type AppAccessContext } from "@asafarim/auth";
import { ThemeProvider, ThemeScript, ThemeToggle } from "@asafarim/theme-toggle";
import {
  AppShell,
  AppSwitcher,
  Button,
  ButtonLink,
  TopNav,
  UserMenu,
  getPlatformLinks,
} from "@asafarim/ui";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "AppBuilder",
    template: "%s | AppBuilder",
  },
  description:
    "Describe an internal business app in plain language and get a controlled, versioned, previewable application back.",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();

  // Registry-driven, same rule Hub's launcher/switcher use — no
  // AppBuilder-specific hardcoded visibility here.
  const switcherContext: AppAccessContext = {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  };
  const switcherApps = PLATFORM_APPS.filter(
    (app) => app.key !== "appbuilder" && app.status === "active" && app.key in links && canAccessApp(app, switcherContext),
  );

  // AppBuilder has no local sign-in page — the platform's centralized flow
  // lives on Hub. The callback preserves the original AppBuilder URL so
  // signing in returns here rather than stranding the user on Hub.
  const signInHref = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.appbuilder}/`)}`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="system" />
      </head>
      <body data-app="appbuilder">
        <ThemeProvider defaultTheme="light">
          <AppShell
            product="AppBuilder"
          nav={
            <TopNav
              items={[
                { label: "Overview", href: "/" },
                { label: "Apps", href: "/apps" },
                { label: "New app", href: "/apps/new" },
              ]}
            />
          }
          user={
            <>
              <ThemeToggle />
              <AppSwitcher
                links={switcherApps.map((app) => ({
                  label: app.name,
                  href: links[app.key as keyof typeof links],
                  meta: app.meta,
                }))}
              />
              {session?.user ? (
                <UserMenu
                  name={session.user.name}
                  email={session.user.email}
                  image={session.user.image}
                  roles={session.user.roles}
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
                <ButtonLink href={signInHref} size="sm">
                  Sign in
                </ButtonLink>
              )}
            </>
          }
        >
          {children}
        </AppShell>
      </ThemeProvider>
      </body>
    </html>
  );
}

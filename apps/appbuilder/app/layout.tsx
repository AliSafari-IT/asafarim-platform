import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { auth, signOut, getAppSwitcherApps } from "@asafarim/auth";
import { ThemeProvider, ThemeScript, ThemeToggle } from "@asafarim/theme-toggle";
import {
  AppShell,
  AppSwitcher,
  Button,
  ButtonLink,
  TopNav,
  UserMenu,
  getPlatformLinks,
  toAppSwitcherLinks,
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
  // Set by proxy.ts only for the preview route's strict CSP; absent (and
  // harmless — ThemeScript's `nonce` prop is optional) everywhere else.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Registry-driven, same rule Hub's launcher/switcher use — no
  // AppBuilder-specific hardcoded visibility here.
  const switcherApps = getAppSwitcherApps("appbuilder", {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  });

  // AppBuilder has no local sign-in page — the platform's centralized flow
  // lives on Hub. The callback preserves the original AppBuilder URL so
  // signing in returns here rather than stranding the user on Hub.
  const signInHref = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.appbuilder}/`)}`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="system" nonce={nonce} />
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="e7efaf01-0f6e-466a-98d5-05cd9bf580e5"
        />
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
                links={toAppSwitcherLinks(switcherApps, links)}
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

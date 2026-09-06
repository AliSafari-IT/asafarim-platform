import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { auth, signOut } from "@asafarim/auth";
import { getAppSwitcherApps } from "@asafarim/auth/apps";
import type {} from "@asafarim/auth/types";
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
import "./tasks-ai.css";
import { ServiceWorker } from "../components/pwa/ServiceWorker";

const appUrl = process.env.NEXT_PUBLIC_TASKSAI_URL ?? "https://tasks-ai.asafarim.com";
const appName = "TasksAI";
const appDescription =
  "AI-native work execution: turn scattered intent into an editable, audited plan. From scattered intent to trusted execution.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | From scattered intent to trusted execution`,
    template: "%s | TasksAI",
  },
  description: appDescription,
  applicationName: appName,
  icons: { icon: "/favicon.svg" },
  // Nothing is indexable until the M00 commercial and compliance gates are
  // resolved and there is a launched product — see docs/charter.md.
  robots: { index: false, follow: false },
};

const NAV_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Workspace", href: "/workspace" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();

  const switcherApps = getAppSwitcherApps("tasksai", {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  });

  const signInHref = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.tasksai}/workspace`)}`;

  return (
    <html lang="en" data-app="tasks-ai" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="light" />
      </head>
      <body className="antialiased">
        <a href="#ta-main" className="ta-skip">Skip to main content</a>
        <ServiceWorker />
        <ThemeProvider defaultTheme="light">
          <AppShell
            product="TasksAI"
            nav={<TopNav items={NAV_ITEMS} />}
            user={
              <>
                <ThemeToggle />
                <AppSwitcher links={toAppSwitcherLinks(switcherApps, links)} />
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
            footer={
              <span>
                TasksAI is in early development — not a launched product, and not for
                production use. No commercial service operates behind it yet. See{" "}
                <a href="/">what exists so far</a>.
              </span>
            }
          >
            <div id="ta-main" tabIndex={-1}>
              {children}
            </div>
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

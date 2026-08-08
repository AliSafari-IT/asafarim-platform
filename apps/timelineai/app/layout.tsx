import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { auth, signOut, hasRole, ROLES, PLATFORM_APPS, canAccessApp, type AppAccessContext } from "@asafarim/auth";
import { ThemeProvider, ThemeScript, ThemeToggle } from "@asafarim/theme-toggle";
import { AppShell, AppSwitcher, Button, ButtonLink, TopNav, UserMenu, getPlatformLinks } from "@asafarim/ui";
import { SessionProvider } from "@/components/SessionProvider";
import "@asafarim/ui/styles.css";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "https://tlai.asafarim.com";
const appName = "TimelineAI";
const appDescription =
  "Create polished, visual timelines — project plans, roadmaps, Gantt charts, calendars, and storytelling — no design skills needed.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | Visual timelines, made easy`,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();
  const isAdmin = hasRole(session, ROLES.ADMIN);

  // Same registry-driven rule Hub's launcher/switcher use — no
  // TimelineAI-specific hardcoded visibility here (see packages/auth's
  // PLATFORM_APPS). TimelineAI isn't registered there yet (platform-nav
  // integration is a follow-up task), so it simply doesn't appear in its
  // own switcher — every other active app does.
  const switcherContext: AppAccessContext = {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  };
  const switcherApps = PLATFORM_APPS.filter(
    (app) => app.key !== "timelineai" && app.status === "active" && app.key in links && canAccessApp(app, switcherContext)
  );

  const signInHref = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${appUrl}/`)}`;

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Create", href: "/create" },
    ...(session?.user ? [{ label: "Dashboard", href: "/dashboard" }] : []),
    ...(isAdmin ? [{ label: "Admin", href: "/admin" }] : []),
  ];

  return (
    <html lang="en" data-app="timelineai" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="system" />
      </head>
      <body className="antialiased">
        <ThemeProvider defaultTheme="dark">
          <SessionProvider>
            <AppShell
              product="TimelineAI"
              nav={<TopNav items={navItems} />}
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
                    <UserMenu name={session.user.name} email={session.user.email} image={session.user.image} roles={session.user.roles}>
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
          </SessionProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

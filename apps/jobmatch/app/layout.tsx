import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getAppSwitcherApps } from "@asafarim/auth/apps";
// Side-effect import: registers @asafarim/auth's next-auth type
// augmentations (Session.user.roles, isActive) used by lib/workspace.ts.
import type {} from "@asafarim/auth/types";
import { ThemeProvider, ThemeScript, ThemeToggle } from "@asafarim/theme-toggle";
import { AppShell, AppSwitcher, TopNav, getPlatformLinks, toAppSwitcherLinks } from "@asafarim/ui";
import "@asafarim/ui/styles.css";
import "./jobmatch.css";

const appUrl = process.env.NEXT_PUBLIC_JOBMATCH_URL ?? "https://jobmatch.asafarim.com";
const appName = "JobMatch";
const appDescription =
  "An explainable, source-transparent job-search assistant: fewer vacancies, each with the reason it fits.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | Explainable job search`,
    template: "%s | JobMatch",
  },
  description: appDescription,
  applicationName: appName,
  icons: { icon: "/favicon.svg" },
  // Nothing is indexable until the M0 legal decisions (JM-001, JM-005,
  // JM-008) are recorded and candidate terms exist.
  robots: { index: false, follow: false },
};

const NAV_ITEMS = [
  { label: "Overview", href: "/" },
  { label: "Workspace", href: "/workspace" },
  { label: "Profile", href: "/profile" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = getPlatformLinks();
  // The switcher is rendered for an anonymous viewer: the landing page is
  // public, and resolving the real session here would make every route
  // dynamic for the sake of a menu.
  const switcherApps = getAppSwitcherApps("jobmatch", { roles: [], authenticated: false });

  return (
    <html lang="en" data-app="jobmatch" suppressHydrationWarning>
      <head>
        {/* Light by default, like the token block in @asafarim/ui: candidates
            read long job descriptions here and a light ground is the better
            default for sustained reading. The toggle still wins, and its
            choice persists. */}
        <ThemeScript defaultTheme="light" />
      </head>
      <body className="antialiased">
        <ThemeProvider defaultTheme="light">
          <AppShell
            product="JobMatch"
            nav={<TopNav items={NAV_ITEMS} />}
            user={
              <>
                <ThemeToggle />
                <AppSwitcher links={toAppSwitcherLinks(switcherApps, links)} />
              </>
            }
            footer={
              <span>
                No job sources are connected yet, so nothing is matched against — see{" "}
                <a href="/">what exists so far</a>.
              </span>
            }
          >
            {children}
          </AppShell>
        </ThemeProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { getAppSwitcherApps } from "@asafarim/auth/apps";
// Side-effect import: registers @asafarim/auth's next-auth type
// augmentations (Session.user.roles, etc.) so packages/auth/src/roles.ts
// type-checks here, even though Labs never calls into Auth.js itself.
import type {} from "@asafarim/auth/types";
import { ThemeProvider, ThemeScript, ThemeToggle } from "@asafarim/theme-toggle";
import { AppShell, AppSwitcher, TopNav, getPlatformLinks, toAppSwitcherLinks } from "@asafarim/ui";
import "@asafarim/ui/styles.css";
import "./labs.css";

const appUrl = process.env.NEXT_PUBLIC_LABS_URL ?? "https://labs.asafarim.com";
const appName = "ASafarIM Labs";
const appDescription =
  "The experimental workbench for ASafarIM — interact with what's being explored next, not just what's already shipped.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | Prototypes and interactive canvases`,
    template: "%s | ASafarIM Labs",
  },
  description: appDescription,
  applicationName: appName,
  icons: { icon: "/favicon.svg" },
  robots: { index: true, follow: true },
};

const NAV_ITEMS = [
  { label: "Workbench", href: "/" },
  { label: "Experiments", href: "/experiments" },
  { label: "Ideas", href: "/ideas" },
  { label: "Changelog", href: "/changelog" },
  { label: "About", href: "/about" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  // Labs is public — nobody signs in here, so the switcher context is always
  // an anonymous visitor. This still resolves the full app list correctly
  // because "labs" itself is public and every other public app is included.
  const links = getPlatformLinks();
  const switcherApps = getAppSwitcherApps("labs", { roles: [], authenticated: false });

  return (
    <html lang="en" data-app="labs" suppressHydrationWarning>
      <head>
        {/* Labs hangs dark by default, same as TimelineAI's workbench-adjacent
            mood — the light palette only applies once the user picks it. */}
        <ThemeScript defaultTheme="dark" />
      </head>
      <body className="antialiased">
        <ThemeProvider defaultTheme="dark">
          <AppShell
            product="Labs"
            nav={<TopNav items={NAV_ITEMS} />}
            user={
              <>
                <ThemeToggle />
                <AppSwitcher links={toAppSwitcherLinks(switcherApps, links)} />
              </>
            }
            footer={
              <span>
                Public and unstable by design — see <a href="/about">/about</a> for the kill-switch
                policy.
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

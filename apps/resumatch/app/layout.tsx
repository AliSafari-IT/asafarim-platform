import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { auth, signOut } from "@asafarim/auth";
import { getAppSwitcherApps } from "@asafarim/auth/apps";
// Side-effect import: registers @asafarim/auth's next-auth type
// augmentations (Session.user.roles, isActive) used by lib/workspace.ts.
import type {} from "@asafarim/auth/types";
import { ThemeProvider, ThemeToggle } from "@asafarim/theme-toggle";
import { ThemeScript } from "@asafarim/theme-toggle/script";
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
import "./resumatch.css";

const appUrl = process.env.NEXT_PUBLIC_RESUMATCH_URL ?? "https://resumatch.asafarim.com";
const appName = "ResuMatch";
const appDescription =
  "AI-tailored CVs: paste a job posting URL and rewrite your resume toward it, then download it as a PDF.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | AI-tailored CVs`,
    template: "%s | ResuMatch",
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
  { label: "Roadmap", href: "/roadmap" },
  { label: "Workspace", href: "/workspace" },
  { label: "Profile", href: "/profile" },
  { label: "Tailor", href: "/tailor" },
  { label: "History", href: "/tailor/history" },
  { label: "Applications", href: "/applications" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();

  // Registry-driven, the same rule Hub's launcher and every other app's
  // switcher use — no ResuMatch-specific hardcoded visibility.
  const switcherApps = getAppSwitcherApps("resumatch", {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  });

  // Both sides come from getPlatformLinks() rather than from `appUrl` above:
  // that constant falls back to the production URL so `metadataBase` is
  // right, which would send a developer signing in locally to the live site.
  // PlatformLinks falls back to localhost, which is what a sign-in link
  // needs.
  const signInHref = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.resumatch}/`)}`;

  return (
    <html lang="en" data-app="resumatch" suppressHydrationWarning>
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
            product="ResuMatch"
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
                    profileHref="/profile"
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
                An experimental portfolio showcase — AI rewrites only what you already wrote in
                your confirmed profile, and never invents an employer, a date, a degree, or a skill
                you did not list. See{" "}
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

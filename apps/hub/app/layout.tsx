import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { auth, signOut, getAppSwitcherApps } from "@asafarim/auth";
import { I18nProvider } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
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
import { SessionProviderWrapper } from "./_components/SessionProviderWrapper";
import "@asafarim/ui/styles.css";
import "@asafarim/country-language-selector/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Hub",
    template: "%s | ASafarIM Hub",
  },
  description:
    "Your workspace for apps, showcases, and experiments — mission control for the ASafarIM Platform.",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();

  // Registry-driven, same access rule the /apps launchpad uses — no
  // per-app hardcoded visibility here. Coming-soon apps stay out of the
  // compact switcher (they're never actionable); Hub itself is skipped
  // since you're already standing in it.
  const switcherApps = getAppSwitcherApps("hub", {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  });

  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        {/* Hub keeps its Mission Control dark as the default; the light mood
            in tokens.css only applies once the user picks it. */}
        <ThemeScript defaultTheme="dark" />
      </head>
      <body data-app="hub">
        <ThemeProvider defaultTheme="dark">
        <I18nProvider initialLocale={initialLocale}>
        <SessionProviderWrapper session={session}>
          <AppShell
            product="Hub"
            nav={
              session?.user ? (
                <TopNav
                  items={[
                    { label: "Dashboard", href: "/dashboard" },
                    { label: "Apps", href: "/apps" },
                    { label: "Profile", href: "/profile" },
                    { label: "Settings", href: "/settings" },
                  ]}
                />
              ) : null
            }
            user={
              <>
                <ThemeToggle />
                <CountryLanguageSelector lockCountry="BE" />
                <AppSwitcher
                  links={toAppSwitcherLinks(switcherApps, links)}
                />
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
                  <ButtonLink
                    href={`/sign-in?callbackUrl=${encodeURIComponent(`${links.hub}/`)}`}
                    size="sm"
                  >
                    Sign in
                  </ButtonLink>
                )}
              </>
            }
          >
            {children}
          </AppShell>
        </SessionProviderWrapper>
        </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

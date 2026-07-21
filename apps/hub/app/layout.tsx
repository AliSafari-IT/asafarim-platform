import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import {
  auth,
  signOut,
  PLATFORM_APPS,
  canAccessApp,
  type AppAccessContext,
} from "@asafarim/auth";
import { I18nProvider } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
import {
  AppShell,
  AppSwitcher,
  Button,
  ButtonLink,
  TopNav,
  UserMenu,
  getPlatformLinks,
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
  const switcherContext: AppAccessContext = {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  };
  const switcherApps = PLATFORM_APPS.filter(
    (app) =>
      app.key !== "hub" &&
      app.status === "active" &&
      app.key in links &&
      canAccessApp(app, switcherContext)
  );

  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body data-app="hub">
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
                <CountryLanguageSelector lockCountry="BE" />
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
      </body>
    </html>
  );
}

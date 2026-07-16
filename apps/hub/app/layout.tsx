import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { auth, signOut, hasRole, ROLES } from "@asafarim/auth";
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
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();
  const isAdminUser = hasRole(session, [ROLES.ADMIN]);
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
                  links={[
                    { label: "ASafarIM Digital", href: links.web, meta: "public" },
                    { label: "Showcase", href: links.showcase, meta: "public" },
                    ...(isAdminUser
                      ? [{ label: "Admin Console", href: links.admin, meta: "restricted" }]
                      : []),
                  ]}
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

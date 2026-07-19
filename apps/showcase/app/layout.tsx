import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { auth, signOut } from "@asafarim/auth";
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
import "@asafarim/ui/styles.css";
import "@asafarim/country-language-selector/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Showcase",
    template: "%s | ASafarIM Showcase",
  },
  description:
    "Curated projects from the ASafarIM Digital lab — demos, case studies, and experiments.",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();
  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body data-app="showcase">
        <I18nProvider initialLocale={initialLocale}>
        <AppShell
          product="Showcase"
          nav={
            <TopNav
              items={[
                { label: "Exhibition", href: "/" },
                { label: "Projects", href: "/projects" },
                { label: "Labs", href: "/labs" },
              ]}
            />
          }
          user={
            <>
              <CountryLanguageSelector lockCountry="BE" />
              <AppSwitcher
                links={[
                  { label: "ASafarIM Digital", href: links.web, meta: "studio" },
                  { label: "Hub", href: links.hub, meta: session?.user ? "dashboard" : "sign in" },
                ]}
              />
              {session?.user ? (
                <UserMenu
                  name={session.user.name}
                  email={session.user.email}
                  image={session.user.image}
                  roles={session.user.roles}
                  profileHref={`${links.hub}/profile`}
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
                  href={`${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.showcase}/`)}`}
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
        </I18nProvider>
      </body>
    </html>
  );
}

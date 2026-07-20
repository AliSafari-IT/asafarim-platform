import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { auth, signOut } from "@asafarim/auth";
import { I18nProvider } from "@asafarim/shared-i18n";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import showcaseDictionaries from "../lib/i18n-dictionaries";
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
  const t = getServerTranslator(initialLocale, showcaseDictionaries);

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body data-app="showcase">
        <I18nProvider initialLocale={initialLocale} dictionaries={showcaseDictionaries}>
        <AppShell
          product="Showcase"
          nav={
            <TopNav
              items={[
                { label: t("showcase.nav.exhibition"), href: "/" },
                { label: t("showcase.nav.projects"), href: "/projects" },
                { label: t("showcase.nav.labs"), href: "/labs" },
              ]}
            />
          }
          user={
            <>
              <CountryLanguageSelector lockCountry="BE" />
              <AppSwitcher
                links={[
                  { label: "ASafarIM Digital", href: links.web, meta: t("showcase.appSwitcher.studio") },
                  { label: "Hub", href: links.hub, meta: session?.user ? t("showcase.appSwitcher.dashboard") : t("common.signIn") },
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
                      {t("common.signOut")}
                    </Button>
                  </form>
                </UserMenu>
              ) : (
                <ButtonLink
                  href={`${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.showcase}/`)}`}
                  size="sm"
                >
                  {t("common.signIn")}
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

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { auth, signOut } from "@asafarim/auth";
import { I18nProvider } from "@asafarim/shared-i18n";
import {
  resolveLocaleFromCookie,
  getServerTranslator,
} from "@asafarim/shared-i18n/server";
import webDictionaries from "../lib/i18n-dictionaries";
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
} from "@asafarim/ui";
import { site } from "../content/site";
import "@asafarim/ui/styles.css";
import "@asafarim/country-language-selector/styles.css";

const links = getPlatformLinks();
const siteUrl = links.web;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: site.title,
    template: "%s — ASafarIM Digital",
  },
  description: site.description,
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg?v=3" },
  openGraph: {
    siteName: site.name,
    title: site.title,
    description: site.description,
    url: siteUrl,
    type: "profile",
    locale: "en_US",
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: ["/twitter-image"],
  },
};

const organizationJsonLd = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: site.organization.name,
  description: site.organization.jobTitle,
  url: siteUrl,
  sameAs: [site.contact.github],
  address: {
    "@type": "PostalAddress",
    addressLocality: "Hasselt",
    addressCountry: "BE",
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());
  const t = getServerTranslator(initialLocale, webDictionaries);

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="system" />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body data-app="web">
        <I18nProvider initialLocale={initialLocale}>
        <ThemeProvider defaultTheme="light">
        <AppShell
          product="Digital"
          nav={
            <TopNav
              items={[
                { label: t("portal.nav.studio"), href: "/" },
                { label: t("portal.nav.about"), href: "/about" },
                { label: t("portal.nav.services"), href: "/services" },
                { label: t("portal.nav.projects"), href: "/projects" },
                { label: t("portal.nav.contact"), href: "/contact" },
              ]}
            />
          }
          user={
            <>
              <ThemeToggle />
              <CountryLanguageSelector lockCountry="BE" />
              <AppSwitcher
                links={[
                  { label: "Vionto", href: links.vionto, meta: "photo-to-story" },
                  { label: "Testora", href: links.testora, meta: "benchmark" },
                  { label: "Showcase", href: links.showcase, meta: "gallery" },
                  { label: "Hub", href: links.hub, meta: session?.user ? "dashboard" : "sign in" },
                  { label: "AppBuilder", href: links.appbuilder, meta: "builder" },
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
                  href={`${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.web}/`)}`}
                  size="sm"
                >
                  {t("common.signIn")}
                </ButtonLink>
              )}
            </>
          }
          footer={
            <span>
              <a href="/privacy">{t("portal.footer.privacy")}</a> ·{" "}
              <a href="/terms">{t("portal.footer.terms")}</a> ·{" "}
              <a href={site.contact.github} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </span>
          }
        >
          {children}
        </AppShell>
        </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

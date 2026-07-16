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

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
        />
      </head>
      <body data-app="web">
        <I18nProvider initialLocale={initialLocale}>
        <AppShell
          product="Digital"
          nav={
            <TopNav
              items={[
                { label: "Studio", href: "/" },
                { label: "About", href: "/about" },
                { label: "Services", href: "/services" },
                { label: "Projects", href: "/projects" },
                { label: "Contact", href: "/contact" },
              ]}
            />
          }
          user={
            <>
              <CountryLanguageSelector lockCountry="BE" />
              <AppSwitcher
                links={[
                  { label: "Showcase", href: links.showcase, meta: "gallery" },
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
                  href={`${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.web}/`)}`}
                  size="sm"
                >
                  Sign in
                </ButtonLink>
              )}
            </>
          }
          footer={
            <span>
              <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> ·{" "}
              <a href={site.contact.github} target="_blank" rel="noreferrer">
                GitHub
              </a>
            </span>
          }
        >
          {children}
        </AppShell>
        </I18nProvider>
      </body>
    </html>
  );
}

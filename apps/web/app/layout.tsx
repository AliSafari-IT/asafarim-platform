import type { Metadata } from "next";
import type { ReactNode } from "react";
import { auth, signOut } from "@asafarim/auth";
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

const personJsonLd = {
  "@context": "https://schema.org",
  "@type": "Person",
  name: site.person.name,
  jobTitle: site.person.jobTitle,
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

  return (
    <html lang="en">
      <head>
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: JSON.stringify(personJsonLd) }}
        />
      </head>
      <body data-app="web">
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
                <ButtonLink href={`${links.hub}/sign-in`} size="sm">
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
      </body>
    </html>
  );
}

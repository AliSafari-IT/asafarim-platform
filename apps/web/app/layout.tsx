import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, AppSwitcher, TopNav, getPlatformLinks } from "@asafarim/ui";
import { site } from "../content/site";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: site.title,
    template: "%s — ASafarIM Digital",
  },
  description: site.description,
  icons: { icon: "/favicon.svg" },
  openGraph: {
    siteName: site.name,
    title: site.title,
    description: site.description,
    type: "website",
    locale: "en_US",
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = getPlatformLinks();

  return (
    <html lang="en">
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
            <AppSwitcher
              links={[
                { label: "Showcase", href: links.showcase, meta: "gallery" },
                { label: "Hub", href: links.hub, meta: "sign in" },
              ]}
            />
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

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, AppSwitcher, TopNav, getPlatformLinks } from "@asafarim/ui";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Digital — practical apps, built with care",
    template: "%s | ASafarIM Digital",
  },
  description:
    "ASafarIM Digital is a personal digital studio: web platforms, tools, and experiments, designed and built end to end.",
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
              <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
            </span>
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

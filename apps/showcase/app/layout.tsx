import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, TopNav, getPlatformLinks } from "@asafarim/ui";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Showcase",
    template: "%s | ASafarIM Showcase",
  },
  description:
    "Curated projects from the ASafarIM Digital lab — demos, case studies, and experiments.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const links = getPlatformLinks();

  return (
    <html lang="en">
      <body data-app="showcase">
        <AppShell
          product="Showcase"
          nav={
            <TopNav
              items={[
                { label: "Exhibition", href: "/" },
                { label: "Projects", href: "/projects" },
                { label: "Labs", href: "/labs" },
                { label: "Website ↗", href: links.web },
                { label: "Hub ↗", href: links.hub },
              ]}
            />
          }
        >
          {children}
        </AppShell>
      </body>
    </html>
  );
}

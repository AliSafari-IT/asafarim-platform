import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AppShell, AppSwitcher, TopNav, getPlatformLinks } from "@asafarim/ui";
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
              ]}
            />
          }
          user={
            <AppSwitcher
              links={[
                { label: "ASafarIM Digital", href: links.web, meta: "studio" },
                { label: "Hub", href: links.hub, meta: "sign in" },
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

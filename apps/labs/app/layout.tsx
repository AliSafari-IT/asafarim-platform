import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeProvider, ThemeScript, ThemeToggle } from "@asafarim/theme-toggle";
import "@asafarim/ui/styles.css";
import "./labs.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Labs",
    template: "%s | ASafarIM Labs",
  },
  description:
    "The experimental workbench for ASafarIM — interact with what's being explored next, not just what's already shipped.",
  icons: { icon: "/favicon.svg" },
};

const NAV = [
  { label: "Workbench", href: "/" },
  { label: "Experiments", href: "/experiments" },
  { label: "Ideas", href: "/ideas" },
  { label: "Changelog", href: "/changelog" },
  { label: "About", href: "/about" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="dark" />
      </head>
      <body data-app="labs">
        <ThemeProvider defaultTheme="dark">
          <div style={{ maxWidth: 1080, margin: "0 auto", padding: "1.5rem" }}>
            <header
              className="labs-shell-header"
              style={{ borderBottom: "none", marginBottom: "2rem" }}
            >
              <Link href="/" className="labs-mono" style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                <span className="labs-accent">▚</span> ASafarIM Labs
              </Link>
              <nav
                className="labs-mono"
                style={{ display: "flex", gap: "1.25rem", fontSize: "0.85rem" }}
              >
                {NAV.map((item) => (
                  <Link key={item.href} href={item.href}>
                    {item.label}
                  </Link>
                ))}
              </nav>
              <ThemeToggle />
            </header>
            <main>{children}</main>
            <footer
              className="labs-mono"
              style={{ marginTop: "3rem", paddingTop: "1rem", fontSize: "0.75rem", opacity: 0.6 }}
            >
              Labs is public and unstable by design. Nothing here carries production guarantees —
              see <Link href="/about">/about</Link> for the kill-switch policy.
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

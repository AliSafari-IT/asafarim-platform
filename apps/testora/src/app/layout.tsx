import type { Metadata } from "next";
import { ThemeProvider, ThemeScript } from "@asafarim/theme-toggle";
// Shared platform design tokens + component styles for the common header.
// Import the token/component sheets only (not the base reset) so testora's
// own Tailwind styling of the tool UI is left intact. globals.css last so its
// rules win on any overlap.
import "@asafarim/ui/styles/tokens.css";
import "@asafarim/ui/styles/components.css";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Testora — E2E test automation",
    template: "%s · Testora",
  },
  description:
    "Define functional requirements, suites, fixtures and cases, run them with TestCafe, and store results in PostgreSQL.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // Both the platform mood ([data-app="testora"] in tokens.css) and
    // testora's own shadcn palette (globals.css) key off data-theme; the
    // Tailwind config is darkMode:"class", so ThemeScript/ThemeProvider
    // also mirror the theme onto the `dark` class via syncClass. Dark stays
    // the default — suppressHydrationWarning because the no-flash script
    // rewrites both before React hydrates.
    <html lang="en" className="dark" data-theme="dark" suppressHydrationWarning>
      <head>
        <ThemeScript defaultTheme="dark" syncClass="dark" />
        <script
          defer
          src="https://cloud.umami.is/script.js"
          data-website-id="e7efaf01-0f6e-466a-98d5-05cd9bf580e5"
        />
      </head>
      <body data-app="testora">
        <ThemeProvider defaultTheme="dark" syncClass="dark">
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}

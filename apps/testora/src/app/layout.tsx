import type { Metadata } from "next";
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
    // data-theme="dark": the platform token sheet is dark-only for testora
    // (see the [data-app="testora"] mood). className="dark" drives Tailwind.
    <html lang="en" className="dark" data-theme="dark">
      <body data-app="testora">{children}</body>
    </html>
  );
}

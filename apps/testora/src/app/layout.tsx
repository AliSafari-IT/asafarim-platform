import type { Metadata } from "next";
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
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}

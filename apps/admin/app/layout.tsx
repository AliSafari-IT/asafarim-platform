import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@asafarim/ui/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Admin",
    template: "%s | ASafarIM Admin",
  },
  description: "System operations console of the ASafarIM Platform",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body data-app="admin">{children}</body>
    </html>
  );
}

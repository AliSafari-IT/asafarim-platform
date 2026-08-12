import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { I18nProvider } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { ThemeProvider, ThemeScript } from "@asafarim/theme-toggle";
import "@asafarim/ui/styles.css";
import "@asafarim/country-language-selector/styles.css";
import "./seed-data.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Admin",
    template: "%s | ASafarIM Admin",
  },
  description: "System operations console of the ASafarIM Platform",
  icons: { icon: "/favicon.svg" },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <head>
        {/* The Console stays near-black by default; the light mood in
            tokens.css only applies once the user picks it. The provider
            lives here rather than in (admin) so /sign-in and /denied —
            which are outside that group — switch theme too. */}
        <ThemeScript defaultTheme="dark" />
      </head>
      <body data-app="admin">
        <ThemeProvider defaultTheme="dark">
          <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

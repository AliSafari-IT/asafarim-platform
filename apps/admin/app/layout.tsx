import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { I18nProvider } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import "@asafarim/ui/styles.css";
import "@asafarim/country-language-selector/styles.css";

export const metadata: Metadata = {
  title: {
    default: "ASafarIM Admin",
    template: "%s | ASafarIM Admin",
  },
  description: "System operations console of the ASafarIM Platform",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());

  return (
    <html lang={initialLocale} suppressHydrationWarning>
      <body data-app="admin">
        <I18nProvider initialLocale={initialLocale}>{children}</I18nProvider>
      </body>
    </html>
  );
}

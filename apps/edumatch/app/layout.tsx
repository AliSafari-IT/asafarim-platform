import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SessionProvider } from "@/components/SessionProvider";
import { EduNav } from "@/components/EduNav";
import { EduFooter } from "@/components/EduFooter";
import { I18nProvider } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { edumatchDictionaries } from "@/lib/i18n-dictionaries";
// @asafarim/ui/styles.css must load before ./globals.css: its base.css sets
// an unscoped `body { color: var(--ink); background-color: var(--bg) }` for
// apps that opt into the shared `data-app` mood system. EduMatch uses its
// own `--color-*` tokens instead, so --ink/--bg are undefined here — if that
// rule loads last it wins the (equal-specificity, unlayered) cascade and
// paints body transparent-on-black over EduMatch's real theme.
import "@asafarim/ui/styles.css";
import "./globals.css";

const appName = "EduMatch";
const appDescription =
  "A working showcase project from ASafarIM Digital: a complete AI-guided tutoring-marketplace architecture, deployed on production infrastructure. Not an operating marketplace.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  title: {
    default: `${appName} | AI homework help & tutor-matching showcase`,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-icon.svg", type: "image/svg+xml" }],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());

  return (
    <html
      lang={initialLocale}
      suppressHydrationWarning
      data-theme={initialTheme}
    >
      <body className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <I18nProvider
          initialLocale={initialLocale}
          dictionaries={edumatchDictionaries}
        >
          <SessionProvider>
            <EduNav />
            <main className="flex-1">{children}</main>
            <EduFooter />
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

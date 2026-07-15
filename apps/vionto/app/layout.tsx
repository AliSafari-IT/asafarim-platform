import type { Metadata } from "next";
import type { ReactNode } from "react";
import Script from "next/script";
import { cookies } from "next/headers";
import { SessionProvider } from "@/components/SessionProvider";
import { I18nProvider } from "@asafarim/shared-i18n";
import { resolveLocaleFromCookie } from "@asafarim/shared-i18n/server";
import { viontoDictionaries } from "@/lib/i18n-dictionaries";
import { readThemeFromCookie, themeInitScript } from "@/lib/theme";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_VIONTO_URL ?? "https://vionto.asafarim.com";
const appName = "Vionto";
const appDescription =
  "AI-powered photo-to-story video creator for transforming image collections into narrated MP4 memories.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | Photo-to-Story Video`,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  keywords: ["Vionto", "photo video maker", "AI storytelling", "narrated MP4", "image slideshow"],
  alternates: {
    canonical: appUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: appUrl,
    siteName: appName,
    title: `${appName} | Photo-to-Story Video`,
    description: appDescription,
  },
  twitter: {
    card: "summary_large_image",
    title: `${appName} | Photo-to-Story Video`,
    description: appDescription,
  },
  icons: {
    icon: "/favicon.svg",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialLocale = resolveLocaleFromCookie(cookieStore.toString());
  const theme = readThemeFromCookie(cookieStore.toString()) ?? "dark";

  return (
    <html lang={initialLocale} data-theme={theme} style={{ colorScheme: theme }} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Script
          id="theme-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: themeInitScript,
          }}
        />
        <I18nProvider initialLocale={initialLocale} dictionaries={viontoDictionaries}>
          <SessionProvider>
            <div className="flex-1">{children}</div>
          </SessionProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

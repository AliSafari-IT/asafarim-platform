import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { SessionProvider } from "@/components/SessionProvider";
import "./globals.css";

const appUrl = process.env.NEXT_PUBLIC_TIMELINEAI_URL ?? "https://tlai.asafarim.com";
const appName = "TimelineAI";
const appDescription =
  "Create polished, visual timelines — project plans, roadmaps, Gantt charts, calendars, and storytelling — no design skills needed.";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),
  title: {
    default: `${appName} | Visual timelines, made easy`,
    template: `%s | ${appName}`,
  },
  description: appDescription,
  applicationName: appName,
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
  },
  robots: { index: true, follow: true },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies();
  const initialTheme = cookieStore.get("theme")?.value === "light" ? "light" : "dark";

  return (
    <html lang="en" data-app="timelineai" data-theme={initialTheme} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col bg-[var(--color-bg)] text-[var(--color-text)] antialiased">
        <SessionProvider>
          <main className="flex-1">{children}</main>
        </SessionProvider>
      </body>
    </html>
  );
}

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { auth, signOut } from "@asafarim/auth";
import { getAppSwitcherApps } from "@asafarim/auth/apps";
// Side-effect import: registers @asafarim/auth's next-auth type
// augmentations (Session.user.roles, isActive) used by lib/workspace.ts.
import type {} from "@asafarim/auth/types";
import { I18nProvider } from "@asafarim/shared-i18n";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
import { ThemeProvider, ThemeToggle } from "@asafarim/theme-toggle";
import { ThemeScript } from "@asafarim/theme-toggle/script";
import {
  AppShell,
  AppSwitcher,
  Button,
  ButtonLink,
  TopNav,
  UserMenu,
  getPlatformLinks,
  toAppSwitcherLinks,
} from "@asafarim/ui";
import "@asafarim/ui/styles.css";
import "@asafarim/country-language-selector/styles.css";
import "./resumatch.css";
import resumatchDictionaries from "../lib/i18n-dictionaries";
import { getTranslator } from "../lib/i18n-server";

const appUrl = process.env.NEXT_PUBLIC_RESUMATCH_URL ?? "https://resumatch.asafarim.com";
const appName = "ResuMatch";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    metadataBase: new URL(appUrl),
    title: {
      default: `${appName} | ${t("resumatch.meta.tagline")}`,
      template: "%s | ResuMatch",
    },
    description: t("resumatch.meta.description"),
    applicationName: appName,
    icons: { icon: "/favicon.svg" },
    // Nothing is indexable until the M0 legal decisions (JM-001, JM-005,
    // JM-008) are recorded and candidate terms exist.
    robots: { index: false, follow: false },
  };
}

const NAV_ITEMS = [
  { key: "resumatch.nav.overview", href: "/" },
  { key: "resumatch.nav.roadmap", href: "/roadmap" },
  { key: "resumatch.nav.workspace", href: "/workspace" },
  { key: "resumatch.nav.profile", href: "/profile" },
  { key: "resumatch.nav.tailor", href: "/tailor" },
  { key: "resumatch.nav.history", href: "/tailor/history" },
  { key: "resumatch.nav.applications", href: "/applications" },
  { key: "resumatch.nav.aiUsage", href: "/ai-usage" },
];

export default async function RootLayout({ children }: { children: ReactNode }) {
  const session = await auth();
  const links = getPlatformLinks();

  // The shared asafarim-lang cookie (set by the language bar in any
  // ASafarIM app). No cookie → English, which with the Belgium lock below
  // is the "be-en" default, as in Hub/Web/Showcase.
  const { locale: initialLocale, t } = await getTranslator();
  const navItems = NAV_ITEMS.map((item) => ({ label: t(item.key), href: item.href }));

  // Registry-driven, the same rule Hub's launcher and every other app's
  // switcher use — no ResuMatch-specific hardcoded visibility.
  const switcherApps = getAppSwitcherApps("resumatch", {
    roles: session?.user?.roles ?? [],
    authenticated: Boolean(session?.user),
  });

  // Both sides come from getPlatformLinks() rather than from `appUrl` above:
  // that constant falls back to the production URL so `metadataBase` is
  // right, which would send a developer signing in locally to the live site.
  // PlatformLinks falls back to localhost, which is what a sign-in link
  // needs.
  const signInHref = `${links.hub}/sign-in?callbackUrl=${encodeURIComponent(`${links.resumatch}/`)}`;

  return (
    <html lang={initialLocale} data-app="resumatch" suppressHydrationWarning>
      <head>
        {/* Light by default, like the token block in @asafarim/ui: candidates
            read long job descriptions here and a light ground is the better
            default for sustained reading. The toggle still wins, and its
            choice persists. */}
        <ThemeScript defaultTheme="light" />
      </head>
      <body className="antialiased">
        <I18nProvider initialLocale={initialLocale} dictionaries={resumatchDictionaries}>
          <ThemeProvider defaultTheme="light">
            <AppShell
              product="ResuMatch"
              tagline={t("shell.tagline")}
              nav={<TopNav items={navItems} labels={{ navigation: t("shell.navigation"), menu: t("shell.menu") }} />}
              user={
                <>
                  <ThemeToggle
                    labels={{
                      toDark: t("shell.theme.toDark"),
                      toLight: t("shell.theme.toLight"),
                      darkTitle: t("shell.theme.dark"),
                      lightTitle: t("shell.theme.light"),
                    }}
                  />
                  <CountryLanguageSelector lockCountry="BE" />
                  <AppSwitcher
                    links={toAppSwitcherLinks(switcherApps, links)}
                    labels={{ platform: t("shell.platform"), platformApps: t("shell.platformApps") }}
                  />
                  {session?.user ? (
                    <UserMenu
                      name={session.user.name}
                      email={session.user.email}
                      image={session.user.image}
                      roles={session.user.roles}
                      profileHref="/profile"
                      labels={{
                        accountMenu: t("shell.accountMenu"),
                        signedIn: t("shell.signedIn"),
                        viewProfile: t("shell.viewProfile"),
                      }}
                    >
                      <form
                        action={async () => {
                          "use server";
                          await signOut({ redirectTo: "/" });
                        }}
                      >
                        <Button type="submit" variant="secondary" size="sm">
                          {t("common.signOut")}
                        </Button>
                      </form>
                    </UserMenu>
                  ) : (
                    <ButtonLink href={signInHref} size="sm">
                      {t("common.signIn")}
                    </ButtonLink>
                  )}
                </>
              }
              footer={
                <span>
                  {t("resumatch.footer.body")} <a href="/">{t("resumatch.footer.link")}</a>.
                </span>
              }
            >
              {children}
            </AppShell>
          </ThemeProvider>
        </I18nProvider>
      </body>
    </html>
  );
}

"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  initializeTheme,
  persistTheme,
  applyTheme,
  subscribeThemeChanges,
  type Theme,
} from "@/lib/theme";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
import { useTranslation } from "@asafarim/shared-i18n";

const hubUrl = process.env.NEXT_PUBLIC_HUB_URL || "http://localhost:3001";
const webUrl = process.env.NEXT_PUBLIC_WEB_URL || "http://localhost:3000";
const showcaseUrl = process.env.NEXT_PUBLIC_SHOWCASE_URL || "http://localhost:3002";
const viontoUrl = process.env.NEXT_PUBLIC_VIONTO_URL || "http://localhost:3004";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    setTheme(initializeTheme());
    const unsubscribe = subscribeThemeChanges((next: Theme) => {
      setTheme(next);
      applyTheme(next);
    });
    return unsubscribe;
  }, []);

  const { t } = useTranslation();

  const toggleTheme = () => {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    persistTheme(nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "dark" ? t("vionto.topbar.switchToLight") : t("vionto.topbar.switchToDark")}
      className="group inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-panel)] text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
    >
      {theme === "dark" ? (
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
          <path
            d="M12 3v2.5M12 18.5V21M4.64 4.64l1.77 1.77M17.59 17.59l1.77 1.77M3 12h2.5M18.5 12H21M4.64 19.36l1.77-1.77M17.59 6.41l1.77-1.77M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </button>
  );
}

/** Cross-app switcher: links to the other platform apps. */
function AppSwitcher() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const testoraUrl = process.env.NEXT_PUBLIC_TESTORA_URL || "http://localhost:3005";

  const apps = [
    { label: "ASafarIM Digital", href: webUrl, meta: "public site" },
    { label: "Hub", href: hubUrl, meta: "workspace" },
    { label: "Showcase", href: showcaseUrl, meta: "projects" },
    { label: "Testora", href: testoraUrl, meta: "benchmark" },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={t("vionto.topbar.switchApp")}
        className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-border-strong)] bg-[var(--color-panel)] text-[var(--color-text-muted)] transition hover:border-[var(--color-primary)] hover:text-[var(--color-text)]"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
          <path
            d="M5 5h4v4H5V5Zm5 0h4v4h-4V5Zm5 0h4v4h-4V5ZM5 10h4v4H5v-4Zm5 0h4v4h-4v-4Zm5 0h4v4h-4v-4ZM5 15h4v4H5v-4Zm5 0h4v4h-4v-4Zm5 0h4v4h-4v-4Z"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-[9999] w-64 rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-2 shadow-lg">
          {apps.map((app) => (
            <a
              key={app.href}
              href={app.href}
              className="flex items-baseline justify-between gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--color-surface)]"
            >
              <span>{app.label}</span>
              <span className="text-[11px] text-[var(--color-text-muted)]">{app.meta}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function UserMenu() {
  const { t } = useTranslation();
  const { data: session, status, update } = useSession();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function openMenu() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      const dropW = 280;
      const left = Math.max(8, Math.min(r.right - dropW, window.innerWidth - dropW - 8));
      setDropdownStyle({
        position: "fixed",
        top: r.bottom + 10,
        left,
        width: dropW,
        zIndex: 9999,
      });
    }
    setOpen((o) => !o);
  }

  if (status === "loading") {
    return <div className="h-10 w-10 animate-pulse rounded-full bg-[var(--color-border)]" />;
  }

  if (!session?.user) {
    const callbackUrl = new URL(pathname || "/", `${viontoUrl}/`).toString();
    const signInUrl = `${hubUrl}/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;

    return (
      <a
        href={signInUrl}
        className="rounded-full bg-[var(--color-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
      >
        {t("common.signIn")}
      </a>
    );
  }

  const initials = session.user.name
    ? session.user.name
        .split(" ")
        .map((part: string) => part[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : session.user.email?.[0]?.toUpperCase() ?? "?";

  return (
    <div ref={ref} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={openMenu}
        aria-haspopup="true"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-[var(--color-border-strong)] bg-[var(--color-panel)] px-3 py-2 text-sm font-medium transition hover:border-[var(--color-primary)]"
      >
        {session.user.image ? (
          <img
            src={session.user.image.startsWith("http") ? session.user.image : `${hubUrl}${session.user.image}`}
            alt={session.user.name ?? t("vionto.usermenu.user")}
            width={28}
            height={28}
            referrerPolicy="no-referrer"
            className="rounded-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-600 text-[11px] font-bold text-white">
            {initials}
          </span>
        )}
        <span className="hidden max-w-[120px] truncate sm:block">
          {session.user.name ?? session.user.email}
        </span>
        <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-[var(--color-text-muted)]" aria-hidden="true">
          <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="rounded-2xl border border-[var(--color-border-strong)] bg-[var(--color-panel)] p-2 shadow-lg" style={dropdownStyle}>
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
            <p className="text-sm font-semibold">{session.user.name ?? t("vionto.usermenu.user")}</p>
            <p className="mt-1 text-xs text-[var(--color-text-muted)]">{session.user.email}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {session.user.username && (
                <span className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-[11px] text-[var(--color-text-muted)]">
                  @{session.user.username}
                </span>
              )}
              <span
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  session.user.emailVerified
                    ? "border border-emerald-400/30 bg-emerald-400/10 text-emerald-400"
                    : "border border-amber-400/30 bg-amber-400/10 text-amber-400"
                }`}
              >
                {session.user.emailVerified ? t("vionto.usermenu.verified") : t("vionto.usermenu.verificationPending")}
              </span>
            </div>
          </div>

          <div className="mt-2 grid gap-1">
            <a
              href={`${hubUrl}/profile`}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-4 py-2.5 text-sm font-medium transition hover:bg-[var(--color-surface)]"
            >
              {t("vionto.usermenu.profileSettings")}
            </a>
            <button
              type="button"
              onClick={async () => {
                try {
                  await update();
                  setOpen(false);
                } catch (error) {
                  console.error("Session refresh error:", error);
                }
              }}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm font-medium transition hover:bg-[var(--color-surface)]"
            >
              {t("vionto.usermenu.refreshSession")}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  await signOut({ callbackUrl: viontoUrl });
                } catch (error) {
                  console.error("Sign out error:", error);
                  window.location.href = viontoUrl;
                }
              }}
              className="cursor-pointer rounded-xl px-4 py-2.5 text-left text-sm font-medium text-red-500 transition hover:bg-[var(--color-surface)]"
            >
              {t("common.signOut")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ViontoLogo() {
  const { t } = useTranslation();
  return (
    <Link
      href="/"
      className="flex items-center gap-2 text-[var(--color-text)]"
      aria-label={t("vionto.aria.home")}
    >
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-[var(--color-accent)]/15 text-sm font-semibold text-[var(--color-accent)]">
        Vi
      </span>
      <span className="text-base font-semibold tracking-tight">Vionto</span>
    </Link>
  );
}

export function ViontoTopbarControls() {
  return (
    <div className="flex items-center gap-2">
      <ThemeToggle />
      <AppSwitcher />
      <UserMenu />
    </div>
  );
}


export function ViontoNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const navLinks = [
    { label: t("vionto.nav.dashboard"), href: "/albums" },
    { label: t("vionto.nav.create"), href: "/create" },
    { label: t("vionto.nav.projects"), href: "/projects" },
    { label: t("vionto.nav.organizer"), href: "/organizer" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between gap-4 px-4">
        <div className="flex items-center gap-6">
          <ViontoLogo />
          <nav aria-label="Vionto" className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => {
              const active =
                pathname === link.href || pathname?.startsWith(link.href + "/");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-2">
          <CountryLanguageSelector />
          <ViontoTopbarControls />
        </div>
      </div>
      {/* Mobile nav row */}
      <nav
        aria-label="Vionto mobile"
        className="flex items-center gap-1 overflow-x-auto px-4 pb-2 md:hidden"
      >
        {navLinks.map((link) => {
          const active =
            pathname === link.href || pathname?.startsWith(link.href + "/");
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                active
                  ? "bg-[var(--color-primary)]/10 text-[var(--color-primary)]"
                  : "text-[var(--color-text-muted)]"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

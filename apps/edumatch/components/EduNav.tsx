"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { CountryLanguageSelector } from "@asafarim/country-language-selector";
import {
  BookOpenCheck,
  ChevronDown,
  Grid3X3,
  GraduationCap,
  HelpCircle,
  LayoutDashboard,
  Menu,
  Moon,
  Search,
  Sun,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { getPlatformLinks, toAppSwitcherLinks } from "@asafarim/ui";
// Subpath import: the registry is a pure module, so this stays out of the
// client bundle's way — importing "@asafarim/auth" root here would pull the
// server-only Auth.js/Prisma surface into the browser.
import { getAppSwitcherApps } from "@asafarim/auth/apps";
import NotificationBell from "@/components/NotificationBell";

const platformLinks = getPlatformLinks();
const hubUrl = platformLinks.hub;
const edumatchUrl = platformLinks.edumatch;

function Brand() {
  return (
    <Link href="/" className="edu-brand" aria-label="EduMatch home">
      <span className="edu-brand-mark"><GraduationCap size={22} strokeWidth={2.2} /></span>
      <span>Edu<span>Match</span></span>
    </Link>
  );
}

function ThemeButton() {
  const { t } = useTranslation();
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    localStorage.setItem("theme", next);
  }

  return (
    <button
      className="edu-icon-button"
      type="button"
      onClick={toggle}
      aria-label={t(theme === "dark" ? "edumatch.nav.switchToLight" : "edumatch.nav.switchToDark")}
    >
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function AppMenu() {
  const { t } = useTranslation();
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Registry-driven, exactly like every other app's switcher — this list
  // used to be hand-maintained here and had silently fallen behind.
  const appLinks = toAppSwitcherLinks(
    getAppSwitcherApps("edumatch", {
      roles: (session?.user?.roles as string[] | undefined) ?? [],
      authenticated: Boolean(session?.user),
    }),
    platformLinks
  );

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div className="edu-menu-anchor" ref={ref}>
      <button className="edu-icon-button" type="button" onClick={() => setOpen(!open)} aria-label={t("edumatch.nav.appsMenuAria")} aria-expanded={open}>
        <Grid3X3 size={18} />
      </button>
      {open && (
        <div className="edu-popover edu-app-menu">
          <p>{t("edumatch.nav.appsMenuLabel")}</p>
          {appLinks.map(({ label, href }) => (
            <a href={href} key={href} onClick={() => setOpen(false)}>
              <span>{label}</span><span>↗</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountMenu() {
  const { t } = useTranslation();
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  if (status === "loading") return <span className="edu-avatar edu-avatar-loading" />;
  if (!session?.user) {
    return (
      <a className="edu-nav-cta" href={`${hubUrl}/sign-in?callbackUrl=${encodeURIComponent(edumatchUrl)}`}>
        {t("edumatch.nav.signIn")}
      </a>
    );
  }

  const initials = (session.user.name || session.user.email || "EM")
    .split(/[\s@]/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const image = session.user.image;

  return (
    <div className="edu-menu-anchor" ref={ref}>
      <button className="edu-account-button" type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt="" referrerPolicy="no-referrer" className="edu-avatar edu-avatar-image" />
        ) : (
          <span className="edu-avatar">{initials}</span>
        )}
        <span className="edu-account-name">{session.user.name || session.user.email}</span>
        <ChevronDown size={14} />
      </button>
      {open && (
        <div className="edu-popover edu-account-menu">
          <div className="edu-account-summary">
            <strong>{session.user.name || "EduMatch member"}</strong>
            <span>{session.user.email}</span>
          </div>
          <a href={`${hubUrl}/profile`}><UserRound size={16} /> {t("edumatch.nav.profileSettings")}</a>
          <button type="button" onClick={() => signOut({ callbackUrl: edumatchUrl })}>
            {t("edumatch.nav.signOut")}
          </button>
        </div>
      )}
    </div>
  );
}

export function EduNav() {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const roles = session?.user?.roles || [];
  const nav = [
    { labelKey: "edumatch.nav.findSupport", href: "/student/learn", icon: Search },
    { labelKey: "edumatch.nav.studentSpace", href: "/student", icon: BookOpenCheck },
    { labelKey: "edumatch.nav.tutorStudio", href: "/tutor", icon: UsersRound },
    { labelKey: "edumatch.nav.help", href: "/help", icon: HelpCircle },
    ...(roles.some((role: string) => ["admin", "superadmin", "edumatch_admin"].includes(role))
      ? [{ labelKey: "edumatch.nav.operations", href: "/admin", icon: LayoutDashboard }]
      : []),
  ];

  return (
    <header className="edu-topbar">
      <div className="edu-topbar-inner">
        <Brand />
        <nav className="edu-desktop-nav" aria-label="EduMatch">
          {nav.map(({ labelKey, href, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/student/learn" && href !== "/help" && pathname.startsWith(`${href}/`)) ||
              (href === "/help" && pathname.startsWith("/help"));
            return (
              <Link className={active ? "is-active" : ""} aria-current={active ? "page" : undefined} href={href} key={href}>
                <Icon size={16} />{t(labelKey)}
              </Link>
            );
          })}
        </nav>
        <div className="edu-topbar-actions">
          <div className="edu-language"><CountryLanguageSelector compact /></div>
          <NotificationBell />
          <ThemeButton />
          <AppMenu />
          <AccountMenu />
          <button className="edu-icon-button edu-mobile-toggle" type="button" onClick={() => setMobileOpen(!mobileOpen)} aria-label={t("edumatch.nav.toggleNavAria")} aria-expanded={mobileOpen}>
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {mobileOpen && (
        <nav className="edu-mobile-nav" aria-label="EduMatch mobile">
          {nav.map(({ labelKey, href, icon: Icon }) => (
            <Link href={href} key={href} onClick={() => setMobileOpen(false)}>
              <Icon size={18} />{t(labelKey)}
            </Link>
          ))}
          <div className="edu-mobile-nav-actions">
            <div className="edu-mobile-language"><CountryLanguageSelector compact /></div>
            <ThemeButton />
            <AppMenu />
          </div>
        </nav>
      )}
    </header>
  );
}

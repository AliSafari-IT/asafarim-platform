"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";

type AdminNavItem = {
  labelKey: string;
  href: string;
  icon: string;
  disabled?: boolean;
};

const adminNav: AdminNavItem[] = [
  { labelKey: "edumatch.admin.nav.overview", href: "/admin", icon: "OV" },
  { labelKey: "edumatch.admin.nav.verifications", href: "/admin/tutor-verifications", icon: "TV" },
  { labelKey: "edumatch.admin.nav.matching", href: "/admin/tutor-matching", icon: "MD" },
  { labelKey: "edumatch.admin.nav.disputes", href: "/admin/disputes", icon: "DS" },
  { labelKey: "edumatch.admin.nav.bookings", href: "/admin/bookings", icon: "BK" },
  { labelKey: "edumatch.admin.nav.payments", href: "/admin/payments", icon: "PY" },
  { labelKey: "edumatch.admin.nav.inquiries", href: "/admin/inquiries", icon: "IQ" },
  { labelKey: "edumatch.admin.nav.users", href: "/admin/users", icon: "UT" },
  { labelKey: "edumatch.admin.nav.audit", href: "/admin/audit", icon: "AU" },
];

function isActive(href: string, pathname: string) {
  if (href === "/admin") return pathname === "/admin";
  return pathname.startsWith(href);
}

export function AdminShell({
  children,
  userEmail,
  userRoles,
}: {
  children: ReactNode;
  userEmail: string;
  userRoles: string[];
}) {
  const pathname = usePathname();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 backdrop-blur">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
            >
              &larr; {t("edumatch.admin.backToApp")}
            </Link>
            <span className="text-[var(--color-border)]">|</span>
            <h1 className="text-base font-semibold text-[var(--color-text)]">
              {t("edumatch.admin.title")}
            </h1>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-[var(--color-text-muted)] sm:inline">
              {userEmail}
            </span>
            <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              {userRoles.filter((r) => ["admin", "superadmin", "edumatch_admin"].includes(r)).join(", ") || "admin"}
            </span>
          </div>
        </div>
      </header>

      {/* Mobile nav */}
      <div className="md:hidden border-b border-[var(--color-border)] overflow-x-auto">
        <nav className="flex gap-1 p-2">
          {adminNav.filter((i) => !i.disabled).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                isActive(item.href, pathname)
                  ? "bg-emerald-500/15 font-medium text-emerald-400"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)]"
              }`}
            >
              {t(item.labelKey)}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-bg)] md:block">
          <nav className="flex flex-col gap-0.5 p-3">
            {adminNav.map((item) => {
              if (item.disabled) {
                return (
                  <span
                    key={item.href}
                    className="flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-[var(--color-text-muted)]/50 cursor-not-allowed"
                    title="Coming soon"
                  >
                    <span className="text-xs font-semibold tracking-[0.08em] opacity-50">
                      {item.icon}
                    </span>
                    {t(item.labelKey)}
                  </span>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${
                    isActive(item.href, pathname)
                      ? "bg-emerald-500/15 font-medium text-emerald-400"
                      : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
                  }`}
                >
                  <span className="text-xs font-semibold tracking-[0.08em]">
                    {item.icon}
                  </span>
                  {t(item.labelKey)}
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}

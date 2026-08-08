"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { useState, useEffect } from "react";

export function EduFooter() {
  const { t } = useTranslation();
  const [currentYear, setCurrentYear] = useState(2026);

  useEffect(() => {
    setCurrentYear(new Date().getFullYear());
  }, []);

  return (
    <footer className="border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="mx-auto max-w-7xl px-4 py-8">
        <div className="grid gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-sm font-bold text-white">
                E
              </div>
              <span className="text-lg font-bold text-[var(--color-text)]">EduMatch</span>
            </Link>
            <p className="mt-3 max-w-sm text-sm text-[var(--color-text-muted)]">
              {t("edumatch.footer.tagline")}
            </p>
            <Link
              href="/about-this-project"
              className="mt-3 inline-block text-sm text-[var(--color-accent)] hover:underline"
            >
              Curious who built this? →
            </Link>
          </div>

          {/* Links */}
          <div>
            <h4 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
              {t("edumatch.footer.students")}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/student/inquiry/new" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  {t("edumatch.dashboard.askQuestion")}
                </Link>
              </li>
              <li>
                <Link href="/student" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  {t("edumatch.dashboard.inquiries")}
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
              {t("edumatch.footer.tutors")}
            </h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/tutor" className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                  {t("edumatch.nav.tutor")}
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-4 border-t border-[var(--color-border)] pt-8 md:flex-row">
          <p className="text-sm text-[var(--color-text-muted)]">
            © {currentYear} EduMatch. {t("edumatch.footer.rights")}
          </p>
          <div className="flex items-center gap-4 text-sm text-[var(--color-text-muted)]">
            <Link href="/privacy" className="hover:text-[var(--color-text)]">
              {t("edumatch.footer.privacy")}
            </Link>
            <Link href="/terms" className="hover:text-[var(--color-text)]">
              {t("edumatch.footer.terms")}
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

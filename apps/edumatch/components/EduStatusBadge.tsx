"use client";

import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";
import { FlaskConical } from "lucide-react";

/**
 * Always-visible "this is not a real marketplace yet" indicator, top-left
 * next to the logo on every page. Links to /about-this-project for the full
 * explanation. Deliberately not dismissible — the whole point is that a
 * visitor cannot miss it and cannot make it disappear.
 */
export function EduStatusBadge() {
  const { t } = useTranslation();
  const tooltip = t("edumatch.statusBadge.tooltip");

  return (
    <Link href="/about-this-project" className="edu-status-badge" title={tooltip} aria-label={tooltip}>
      <FlaskConical size={13} strokeWidth={2.4} />
      <span>{t("edumatch.statusBadge.label")}</span>
    </Link>
  );
}

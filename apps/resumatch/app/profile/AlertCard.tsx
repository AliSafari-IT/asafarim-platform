"use client";

import type { ReactNode } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { ShieldAlertIcon, WarningIcon } from "./icons";

/**
 * Premium warning/critical alert card (replaces the plain amber/red boxes).
 * "critical" is reserved for a scan verdict that is not a transient outage
 * (e.g. a real malware finding) — never used for SCANNER_UNAVAILABLE, which
 * stays "warning" since the file itself is not the problem.
 */
export function AlertCard({
  tone,
  title,
  children,
  technicalDetail,
}: {
  tone: "warning" | "critical";
  title: string;
  children: ReactNode;
  technicalDetail?: string | null;
}) {
  const { t } = useTranslation();
  return (
    <div className={`jm-alert-card jm-alert-card--${tone}`}>
      <span className="jm-alert-card__icon">
        {tone === "critical" ? <ShieldAlertIcon /> : <WarningIcon />}
      </span>
      <div className="jm-alert-card__body">
        <p className="jm-alert-card__title">{title}</p>
        <p className="jm-alert-card__text">{children}</p>
        {technicalDetail ? (
          <details className="jm-alert-card__details">
            <summary>{t("resumatch.upload.technicalDetails")}</summary>
            <div className="jm-alert-card__details-body">{technicalDetail}</div>
          </details>
        ) : null}
      </div>
    </div>
  );
}

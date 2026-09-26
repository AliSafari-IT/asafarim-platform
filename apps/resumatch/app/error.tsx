"use client";

import { useEffect } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, PageHeader } from "@asafarim/ui";

/**
 * Route-level error boundary. It deliberately shows the user nothing from
 * `error.message`: ResuMatch errors originate in a database driver and, from
 * M3, in third-party connectors, and those messages routinely embed
 * connection details and request payloads. The digest is the handle an
 * operator uses to find the matching server log line.
 */
export default function ResuMatchError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();
  useEffect(() => {
    console.error(JSON.stringify({ event: "route.error", digest: error.digest ?? null }));
  }, [error.digest]);

  return (
    <>
      <PageHeader kicker={t("resumatch.error.kicker")} title={t("resumatch.error.title")} />
      <Alert tone="error">
        <strong>{t("resumatch.error.strong")}</strong> {t("resumatch.error.body")}{" "}
        <code className="jm-mono">{error.digest ?? t("resumatch.error.unavailable")}</code>.
      </Alert>
      <div style={{ marginTop: "1.5rem" }}>
        <Button onClick={reset}>{t("resumatch.error.retry")}</Button>
      </div>
    </>
  );
}

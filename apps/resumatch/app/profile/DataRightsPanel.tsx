"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, ConfirmDialog } from "@asafarim/ui";
import { BriefcaseIcon, DownloadIcon, LockIcon, SparkIcon, TrashIcon, UploadIcon, UserIcon } from "./icons";

/** What ResuMatch currently holds for this workspace — exactly the four
 *  kinds of row lib/profile/dataRights.ts#eraseWorkspaceData removes. */
export interface DataHoldings {
  documents: number;
  versions: number;
  jobs: number;
  tailored: number;
}

/**
 * Candidate data rights, as buttons (JM-023).
 *
 * Access and erasure are things a candidate does, not things they request
 * and wait for. Both are one click, and erasure goes through the platform's
 * styled ConfirmDialog — never `window.confirm`, per the design system.
 */
export function DataRightsPanel({
  erasureSlaDays,
  hasData,
  holdings,
}: {
  erasureSlaDays: number;
  hasData: boolean;
  holdings: DataHoldings;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const erase = useCallback(async () => {
    setBusy(true);
    setConfirming(false);
    try {
      const response = await fetch("/api/data-rights", { method: "DELETE" });
      const body = (await response.json()) as { objectsFailed?: number; error?: string };
      // A 401 from an expired session returns JSON too. Without this check
      // the candidate is told their data was deleted when the server did
      // nothing at all — the worst possible lie for this particular button.
      if (!response.ok && response.status !== 207) {
        setResult(
          body.error === "Not authorized"
            ? t("resumatch.data.result.sessionExpired")
            : t("resumatch.data.result.failed"),
        );
        return;
      }
      setResult(
        body.objectsFailed && body.objectsFailed > 0
          ? t("resumatch.data.result.partial")
          : t("resumatch.data.result.done"),
      );
      router.refresh();
    } catch {
      setResult(t("resumatch.data.result.failed"));
    } finally {
      setBusy(false);
    }
  }, [router, t]);

  const tiles = [
    { key: "documents", icon: <UploadIcon />, count: holdings.documents },
    { key: "versions", icon: <UserIcon />, count: holdings.versions },
    { key: "jobs", icon: <BriefcaseIcon />, count: holdings.jobs },
    { key: "tailored", icon: <SparkIcon />, count: holdings.tailored },
  ];

  return (
    <section className="rx-panel rx-data" aria-labelledby="rx-data-title">
      <div className="rx-panel__head">
        <div className="rx-data__intro">
          <span className="rx-data__badge" aria-hidden="true">
            <LockIcon />
          </span>
          <div>
            <h2 id="rx-data-title" className="rx-panel__title">
              {t("resumatch.data.title")}
            </h2>
            <p className="rx-panel__sub">{t("resumatch.data.sub")}</p>
          </div>
        </div>
      </div>

      <ul className="rx-data__tiles" aria-label={t("resumatch.data.tilesAria")}>
        {tiles.map((tile) => (
          <li key={tile.key} className="rx-data__tile">
            <span className="rx-data__icon" aria-hidden="true">
              {tile.icon}
            </span>
            <strong className="rx-data__count">{tile.count}</strong>
            <span className="rx-data__label">
              {t(`resumatch.data.${tile.key}.${tile.count === 1 ? "one" : "other"}`)}
            </span>
          </li>
        ))}
      </ul>

      <div className="rx-data__actions">
        <div className="rx-data__action">
          <a href="/api/data-rights" download="resumatch-export.json" className="rx-btn rx-btn--outline">
            <DownloadIcon /> {t("resumatch.data.download")}
          </a>
          <span className="rx-data__hint">{t("resumatch.data.downloadHint")}</span>
        </div>
        <div className="rx-data__action">
          <Button variant="danger" disabled={busy || !hasData} onClick={() => setConfirming(true)}>
            <TrashIcon /> {t("resumatch.data.delete")}
          </Button>
          <span className="rx-data__hint">{t("resumatch.data.deleteHint", { days: erasureSlaDays })}</span>
        </div>
      </div>

      <p className="rx-panel__note">{t("resumatch.data.note")}</p>

      {result ? <Alert tone="info">{result}</Alert> : null}

      <ConfirmDialog
        open={confirming}
        title={t("resumatch.data.dialog.title")}
        message={t("resumatch.data.dialog.message")}
        confirmLabel={t("resumatch.data.dialog.confirm")}
        cancelLabel={t("resumatch.data.dialog.cancel")}
        tone="danger"
        onConfirm={() => void erase()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
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
            ? "Your session has expired, so nothing was deleted. Sign in again and retry."
            : "The deletion could not be completed. Nothing was removed. Please try again.",
        );
        return;
      }
      setResult(
        body.objectsFailed && body.objectsFailed > 0
          ? "Your profile and CV records were deleted. One or more stored files could not be removed yet; this has been logged and will be retried."
          : "Everything ResuMatch held for you has been deleted.",
      );
      router.refresh();
    } catch {
      setResult("The deletion could not be completed. Nothing was removed. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  const tiles = [
    { icon: <UploadIcon />, count: holdings.documents, label: "CV file", plural: "CV files" },
    { icon: <UserIcon />, count: holdings.versions, label: "profile version", plural: "profile versions" },
    { icon: <BriefcaseIcon />, count: holdings.jobs, label: "job posting", plural: "job postings" },
    { icon: <SparkIcon />, count: holdings.tailored, label: "tailored CV", plural: "tailored CVs" },
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
              Your data
            </h2>
            <p className="rx-panel__sub">
              What ResuMatch holds for you right now. Your name and email live with your ASafarIM
              account, not here — ResuMatch only stores an opaque identifier for it.
            </p>
          </div>
        </div>
      </div>

      <ul className="rx-data__tiles" aria-label="Data ResuMatch holds for you">
        {tiles.map((t) => (
          <li key={t.plural} className="rx-data__tile">
            <span className="rx-data__icon" aria-hidden="true">
              {t.icon}
            </span>
            <strong className="rx-data__count">{t.count}</strong>
            <span className="rx-data__label">{t.count === 1 ? t.label : t.plural}</span>
          </li>
        ))}
      </ul>

      <div className="rx-data__actions">
        <div className="rx-data__action">
          <a href="/api/data-rights" download="resumatch-export.json" className="rx-btn rx-btn--outline">
            <DownloadIcon /> Download everything
          </a>
          <span className="rx-data__hint">
            One JSON file: profile versions, job postings, tailored CVs, file details and the action
            log. The original CV files download individually from the list above.
          </span>
        </div>
        <div className="rx-data__action">
          <Button variant="danger" disabled={busy || !hasData} onClick={() => setConfirming(true)}>
            <TrashIcon /> Delete my CV and profile
          </Button>
          <span className="rx-data__hint">
            Erases all four together, immediately — well inside the {erasureSlaDays}-day commitment.
          </span>
        </div>
      </div>

      <p className="rx-panel__note">
        Deletion removes the files, every profile version, and everything read from them — not just
        the original. A record that a deletion took place is kept: it holds no CV content, and it is
        the only proof the deletion happened.
      </p>

      {result ? <Alert tone="info">{result}</Alert> : null}

      <ConfirmDialog
        open={confirming}
        title="Delete your CV and profile?"
        message="This removes your uploaded files, every profile version, and everything read from them. It cannot be undone."
        confirmLabel="Delete everything"
        cancelLabel="Keep my data"
        tone="danger"
        onConfirm={() => void erase()}
        onCancel={() => setConfirming(false)}
      />
    </section>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, ConfirmDialog } from "@asafarim/ui";
import { DRAFT_RETENTION_DAYS, type TailorDraftSummary } from "../../lib/tailoring/drafts/contract";

/**
 * "Unfinished jobs" on /tailor: every other open Tailor draft, latest
 * first, with Resume (reopens it in the flow above, no refetch) and
 * Discard (deletes the draft only; the job row stays).
 */
export function DraftList({ drafts }: { drafts: TailorDraftSummary[] }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [pending, setPending] = useState<TailorDraftSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discard() {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tailor/drafts/${encodeURIComponent(pending.targetJobId)}`, { method: "DELETE" });
      if (!res.ok) throw new Error(String(res.status));
      setPending(null);
      router.refresh();
    } catch {
      setError(t("resumatch.drafts.discardFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rx-panel" aria-labelledby="rx-drafts-title" data-testid="tailor-drafts">
      <div className="rx-panel__head">
        <div>
          <h2 id="rx-drafts-title" className="rx-panel__title">
            {t("resumatch.drafts.title")}
          </h2>
          <p className="rx-panel__sub">{t("resumatch.drafts.sub", { days: DRAFT_RETENTION_DAYS })}</p>
        </div>
      </div>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <ul className="rm-drafts">
        {drafts.map((draft) => (
          <li key={draft.targetJobId} className="rm-drafts__item">
            <div className="rm-drafts__text">
              <span className="rx-card__title">{draft.title ?? t("resumatch.drafts.untitled")}</span>
              {draft.employer ? <span className="rx-card__sub">{draft.employer}</span> : null}
              <span className="rx-card__meta">
                <span className="rx-pill">{t(`resumatch.drafts.step.${draft.step}`)}</span>
                <span className="jm-mono">{t("resumatch.drafts.updated", { date: draft.updatedAt.slice(0, 10) })}</span>
              </span>
            </div>
            <div className="rm-drafts__actions">
              <Link
                href={`/tailor?draft=${encodeURIComponent(draft.targetJobId)}#tailor-flow`}
                className="ui-btn ui-btn--primary ui-btn--sm"
              >
                {t("resumatch.drafts.resume")}
              </Link>
              <Button variant="ghost" size="sm" onClick={() => setPending(draft)}>
                {t("resumatch.drafts.discard")}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        title={t("resumatch.drafts.discardTitle")}
        message={t("resumatch.drafts.discardBody")}
        confirmLabel={t("resumatch.drafts.discard")}
        cancelLabel={t("resumatch.drafts.keep")}
        tone="danger"
        confirmDisabled={busy}
        onConfirm={discard}
        onCancel={() => setPending(null)}
      />
    </section>
  );
}

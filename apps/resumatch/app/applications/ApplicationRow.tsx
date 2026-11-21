"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card } from "@asafarim/ui";
import type { ApplicationListRow } from "../../lib/applications/service";
import type { ApplicationStatusName } from "../../lib/applications/constants";
import { APPLICATION_NOTES_MAX_LENGTH } from "../../lib/applications/patch";
import {
  createFieldSaver,
  patchApplication,
  type FieldSaveState,
  type FieldSaver,
  type SaveErrorKind,
  type SaveOutcome,
} from "../../lib/applications/fieldSaver";
import { followUpDateToDay } from "../../lib/applications/followUp";
import { SendApplicationEntry } from "../../components/applicationEmail/SendApplicationEntry";
import { ApplicationStatusStepper } from "./ApplicationStatusStepper";
import { FollowUpDateField } from "./FollowUpDateField";
import { LocalTime } from "../ai-usage/LocalTime";

type ApplicationWithRelations = ApplicationListRow;

/** The card only needs to know a PDF exists; the composer checks the rest. */
const PLACEHOLDER_PDF = { id: "", filename: "", byteSize: 0, createdAt: "", current: true };

/** Builds a field saver once per row and mirrors its state into React. */
function useFieldSaver<T>(initial: T, send: (value: T) => Promise<SaveOutcome>, onSaved: () => void) {
  const [state, setState] = useState<FieldSaveState<T>>({ persisted: initial, phase: "idle", error: null, failedValue: null });
  const [saver] = useState<FieldSaver<T>>(() =>
    createFieldSaver<T>({ initial, send, onChange: setState, onSaved }),
  );
  return [state, saver] as const;
}

/** One row: status stepper, follow-up date and notes, all PATCHing /api/applications/[id].
 *
 *  Server data stays the source of truth: the stepper always shows the
 *  persisted status (a failed change leaves it where it was, with an error
 *  and a retry), and router.refresh() re-syncs after each successful save.
 *  Notes are the exception that keeps a local draft: the textarea is never
 *  disabled or overwritten while it holds unsaved text, so a failed save, a
 *  slow response or a refresh of the list can't throw away what was typed
 *  (issue #895). */
export function ApplicationRow({
  application,
  pdfs,
}: {
  application: ApplicationWithRelations;
  /** Whether this application's CV and letter have PDFs; null without a CV. */
  pdfs: { cv: boolean; letter: boolean } | null;
}) {
  const router = useRouter();
  const { t } = useTranslation();
  const notesHintId = useId();
  const refresh = () => router.refresh();

  const [statusState, statusSaver] = useFieldSaver<ApplicationStatusName>(
    application.status as ApplicationStatusName,
    (status) => patchApplication(application.id, { status }),
    refresh,
  );
  const [notesState, notesSaver] = useFieldSaver<string>(
    application.notes ?? "",
    // An emptied textarea clears the note rather than storing "".
    (notes) => patchApplication(application.id, { notes: notes === "" ? null : notes }),
    refresh,
  );
  const [draft, setDraft] = useState(application.notes ?? "");
  // Follow-up date as a `YYYY-MM-DD` day, "" for none (lib/applications/followUp.ts).
  const serverFollowUp = followUpDateToDay(application.followUpDate) ?? "";
  const [followUpState, followUpSaver] = useFieldSaver<string>(
    serverFollowUp,
    (day) => patchApplication(application.id, { followUpDate: day === "" ? null : day }),
    refresh,
  );
  const [followUpDraft, setFollowUpDraft] = useState(serverFollowUp);

  // A refresh brings the server's values. Status always follows them (unless
  // a save is in flight); notes only when the draft has no unsaved edits.
  const serverStatus = application.status as ApplicationStatusName;
  const serverNotes = application.notes ?? "";
  useEffect(() => {
    statusSaver.syncPersisted(serverStatus);
  }, [serverStatus, statusSaver]);
  useEffect(() => {
    if (notesSaver.isBusy()) return;
    const { persisted } = notesSaver.getState();
    setDraft((current) => (current === persisted ? serverNotes : current));
    notesSaver.syncPersisted(serverNotes);
  }, [serverNotes, notesSaver]);

  useEffect(() => {
    if (followUpSaver.isBusy()) return;
    const { persisted } = followUpSaver.getState();
    setFollowUpDraft((current) => (current === persisted ? serverFollowUp : current));
    followUpSaver.syncPersisted(serverFollowUp);
  }, [serverFollowUp, followUpSaver]);

  const notesDirty = draft !== notesState.persisted;
  const lastSent = application.sentEmails[0] ?? null;

  // Warn before leaving the page with notes or a date that never reached
  // the server.
  useEffect(() => {
    if (!notesDirty && followUpDraft === followUpState.persisted) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [notesDirty, followUpDraft, followUpState.persisted]);

  const reason = (kind: SaveErrorKind | null) => t(`resumatch.app.save.error.${kind ?? "server"}`);
  const statusLabel = (status: ApplicationStatusName) => t(`resumatch.app.status.${status}`);

  let notesStatus: string | null = null;
  if (notesState.phase === "saving") notesStatus = t("resumatch.app.save.saving");
  else if (notesState.phase !== "error" && notesDirty) notesStatus = t("resumatch.app.save.unsaved");
  else if (notesState.phase === "saved") notesStatus = t("resumatch.app.save.saved");

  return (
    <Card title={application.targetJob.title ?? application.targetJob.employer ?? t("resumatch.untitledJob")}>
      {application.targetJob.employer ? <p style={{ color: "var(--muted)" }}>{application.targetJob.employer}</p> : null}

      <div style={{ marginTop: "0.6rem" }}>
        <ApplicationStatusStepper
          status={statusState.persisted}
          disabled={statusState.phase === "saving"}
          onChange={(status) => statusSaver.save(status)}
        />
        {application.appliedAt ? (
          <p className="rm-app-applied-at" data-testid="applied-at">
            {t("resumatch.app.appliedAt")} <LocalTime iso={new Date(application.appliedAt).toISOString()} />
          </p>
        ) : null}
        <p className="rm-save-status" role="status" aria-live="polite">
          {statusState.phase === "saving"
            ? t("resumatch.app.save.saving")
            : statusState.phase === "saved"
              ? t("resumatch.app.save.saved")
              : ""}
        </p>
        {statusState.phase === "error" && statusState.failedValue ? (
          <div className="rm-save-error"><Alert tone="error">
            <p>
              {t("resumatch.app.save.statusFailed", {
                target: statusLabel(statusState.failedValue),
                current: statusLabel(statusState.persisted),
              })}{" "}
              {reason(statusState.error)}
            </p>
            </Alert>
            {statusState.error !== "notFound" ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => statusSaver.retry()}>
                {t("resumatch.app.save.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <FollowUpDateField
        status={statusState.persisted}
        saveState={followUpState}
        saver={followUpSaver}
        draft={followUpDraft}
        setDraft={setFollowUpDraft}
      />

      <div className="rm-app-send">
        <SendApplicationEntry
          tailoredResumeId={application.tailoredResume?.id ?? null}
          applicationId={application.id}
          hasCoverLetter={Boolean(application.tailoredResume?.coverLetter)}
          pdfs={
            pdfs
              ? {
                  cv: pdfs.cv ? PLACEHOLDER_PDF : null,
                  letter: pdfs.letter ? PLACEHOLDER_PDF : null,
                  hasCoverLetter: Boolean(application.tailoredResume?.coverLetter),
                  ready: pdfs.cv && pdfs.letter,
                }
              : null
          }
        />
        {lastSent ? (
          <p className="rm-app-send__last" data-testid="last-sent">
            {t(`resumatch.app.sent.${lastSent.status}`, { to: lastSent.contactEmail })}{" "}
            <LocalTime iso={new Date(lastSent.sentAt ?? lastSent.attemptedAt).toISOString()} />
            {" · "}
            <a href={`/applications/sent/${encodeURIComponent(lastSent.id)}`} data-testid="view-last-sent">
              {t("resumatch.send.result.view")}
            </a>
            {application._count.sentEmails > 1 ? (
              <>
                {" · "}
                <a href={`/applications/sent?application=${encodeURIComponent(application.id)}`}>
                  {t("resumatch.app.sent.all", { count: application._count.sentEmails })}
                </a>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap" }}>
        {application.tailoredResume ? (
          <a href={`/tailor/${application.tailoredResume.id}/preview`} style={{ fontSize: "0.85rem" }}>
            {t("resumatch.app.viewResume")}
          </a>
        ) : null}
        <a href={`/ai-usage?job=${encodeURIComponent(application.targetJobId)}&preset=year`} style={{ fontSize: "0.85rem" }}>
          {t("resumatch.app.aiCost")}
        </a>
      </div>

      <label className="jm-field" style={{ marginTop: "0.5rem" }}>
        <span>{t("resumatch.app.notes")}</span>
        <textarea className="ui-input"
          rows={2}
          value={draft}
          maxLength={APPLICATION_NOTES_MAX_LENGTH}
          aria-describedby={notesHintId}
          aria-invalid={notesState.phase === "error" ? true : undefined}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => notesSaver.save(draft)}
          style={{ width: "100%" }}
        />
      </label>
      <div id={notesHintId}>
        <p className="rm-save-status" role="status" aria-live="polite">
          {notesStatus ?? ""}
        </p>
        {notesState.phase === "error" ? (
          <div className="rm-save-error"><Alert tone="error">
            <p>
              {t("resumatch.app.save.notesFailed")} {reason(notesState.error)}
            </p>
            </Alert>
            {notesState.error !== "notFound" ? (
              <Button type="button" variant="secondary" size="sm" onClick={() => notesSaver.retry(draft)}>
                {t("resumatch.app.save.retry")}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  );
}

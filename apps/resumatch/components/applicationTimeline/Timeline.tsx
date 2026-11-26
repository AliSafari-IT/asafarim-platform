"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Badge, Button, ConfirmDialog } from "@asafarim/ui";
import type { ApplicationStatusName } from "../../lib/applications/constants";
import { formatFollowUpDay } from "../../lib/applications/followUp";
import { MAX_ATTACHMENTS_PER_EVENT } from "../../lib/applications/timeline/attachments";
import type { AttachmentView, EmailEntryView, EventEntryView, TimelineEntryView } from "../../lib/applications/timeline/view";
import { AttachmentPicker } from "./AttachmentPicker";
import { formatBytes, sendTimelineRequest } from "./client";
import { EventForm } from "./EventForm";
import { ZonedTimeText } from "./ZonedTimeText";

/**
 * The application's history, oldest first (application-timeline.md).
 * Every update is its own entry; ResuMatch emails appear as they were
 * recorded, linking to their unchanged delivery record. Everything the
 * candidate or a recruiter wrote is shown as text, never as HTML.
 */
export function Timeline({
  applicationId,
  status,
  entries,
  openAdd,
}: {
  applicationId: string;
  status: ApplicationStatusName;
  entries: TimelineEntryView[];
  openAdd: boolean;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const [adding, setAdding] = useState(openAdd);
  const [formKey, setFormKey] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const done = (message: string) => {
    setNotice(message);
    setAdding(false);
    setEditing(null);
    setFormKey((k) => k + 1);
    router.refresh();
  };

  return (
    <section className="rm-tl" aria-labelledby="timeline-heading">
      <div className="rm-tl__head">
        <h2 id="timeline-heading" className="rm-composer__heading">
          {t("resumatch.tl.heading")}
        </h2>
        {!adding ? (
          <Button type="button" variant="secondary" size="sm" onClick={() => setAdding(true)} data-testid="add-update">
            {t("resumatch.tl.addUpdate")}
          </Button>
        ) : null}
      </div>

      <p className="rm-save-status" role="status" aria-live="polite" data-testid="timeline-notice">
        {notice ?? ""}
      </p>

      {adding ? (
        <div className="rm-tl__add" id="add-update">
          <h3 className="rm-composer__subheading">{t("resumatch.tl.addUpdate")}</h3>
          <EventForm
            key={formKey}
            applicationId={applicationId}
            currentStatus={status}
            onSaved={() => done(t("resumatch.tl.added"))}
            onCancel={() => setAdding(false)}
          />
        </div>
      ) : null}

      {entries.length === 0 ? (
        <p className="rm-tl-hint" data-testid="timeline-empty">
          {t("resumatch.tl.empty")}
        </p>
      ) : (
        <ol className="rm-tl__list" data-testid="timeline-list">
          {entries.map((entry) =>
            entry.type === "email" ? (
              <EmailEntry key={`email-${entry.id}`} entry={entry} />
            ) : (
              <EventEntry
                key={entry.id}
                entry={entry}
                applicationId={applicationId}
                status={status}
                editing={editing === entry.id}
                onEdit={() => setEditing(entry.id)}
                onDone={done}
                onCancelEdit={() => setEditing(null)}
              />
            ),
          )}
        </ol>
      )}
    </section>
  );
}

function EmailEntry({ entry }: { entry: EmailEntryView }) {
  const { t } = useTranslation();
  const sent = entry.status === "ACCEPTED";
  return (
    <li className="rm-tl__entry rm-tl__entry--email" data-testid="timeline-entry" data-kind="EMAIL">
      <div className="rm-tl__entry-head">
        <Badge tone={sent ? "info" : "warning"}>{sent ? t("resumatch.tl.email.sent") : t(`resumatch.tl.email.${entry.status === "FAILED" ? "failed" : "unconfirmed"}`)}</Badge>
        <ZonedTimeText iso={entry.at} timeZone={null} />
      </div>
      <p className="rm-tl__meta">
        {t("resumatch.tl.email.to", { to: entry.to })} · {entry.subject}
      </p>
      <p className="rm-tl__meta">
        <a href={`/applications/sent/${encodeURIComponent(entry.id)}`}>{t("resumatch.tl.email.view")}</a>
      </p>
    </li>
  );
}

function EventEntry({
  entry,
  applicationId,
  status,
  editing,
  onEdit,
  onDone,
  onCancelEdit,
}: {
  entry: EventEntryView;
  applicationId: string;
  status: ApplicationStatusName;
  editing: boolean;
  onEdit: () => void;
  onDone: (message: string) => void;
  onCancelEdit: () => void;
}) {
  const { t, locale } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const base = `/api/applications/${encodeURIComponent(applicationId)}/events/${encodeURIComponent(entry.id)}`;

  async function remove() {
    setBusy(true);
    const result = await sendTimelineRequest(base, "DELETE");
    setBusy(false);
    setConfirmDelete(false);
    if (result.ok) onDone(t("resumatch.tl.deleted"));
    else setError(result.data.error ?? t("resumatch.tl.error.save"));
  }

  async function upload() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const result = await sendTimelineRequest(`${base}/attachments`, "POST", {}, files);
    setBusy(false);
    if (result.ok) {
      setFiles([]);
      setAdding(false);
      onDone(t("resumatch.tl.filesAdded"));
    } else setError(result.data.error ?? t("resumatch.tl.error.save"));
  }

  if (editing) {
    return (
      <li className="rm-tl__entry" data-testid="timeline-entry" data-kind={entry.kind}>
        <EventForm
          applicationId={applicationId}
          eventId={entry.id}
          currentStatus={status}
          initial={entry}
          onSaved={() => onDone(t("resumatch.tl.edited"))}
          onCancel={onCancelEdit}
        />
      </li>
    );
  }

  return (
    <li className="rm-tl__entry" data-testid="timeline-entry" data-kind={entry.kind} data-event-id={entry.id}>
      <div className="rm-tl__entry-head">
        <Badge tone={entry.kind === "OFFER" ? "success" : entry.kind === "REJECTION" ? "danger" : "neutral"}>{t(`resumatch.tl.kind.${entry.kind}`)}</Badge>
        <ZonedTimeText iso={entry.occurredAt} timeZone={entry.timeZone} testId="entry-time" />
        {entry.toStatus && entry.fromStatus ? (
          <span className="rm-tl__status" data-testid="entry-status-change">
            {t("resumatch.tl.statusChanged", { from: t(`resumatch.app.status.${entry.fromStatus}`), to: t(`resumatch.app.status.${entry.toStatus}`) })}
          </span>
        ) : null}
      </div>
      {entry.sender || entry.recipient ? (
        <p className="rm-tl__meta">
          {entry.sender ? t("resumatch.tl.from", { who: entry.sender }) : null}
          {entry.sender && entry.recipient ? " · " : null}
          {entry.recipient ? t("resumatch.tl.to", { who: entry.recipient }) : null}
        </p>
      ) : null}
      {entry.summary ? (
        <p className="rm-tl__summary" data-testid="entry-summary">
          {entry.summary}
        </p>
      ) : null}
      {entry.nextAction || entry.followUpDay ? (
        <p className="rm-tl__meta">
          {entry.nextAction ? t("resumatch.tl.nextAction", { action: entry.nextAction }) : null}
          {entry.nextAction && entry.followUpDay ? " · " : null}
          {entry.followUpDay ? t("resumatch.tl.followUpOn", { date: formatFollowUpDay(entry.followUpDay, locale) }) : null}
        </p>
      ) : null}
      {entry.attachments.length > 0 ? (
        <ul className="rm-tl__attachments">
          {entry.attachments.map((a) => (
            <AttachmentItem key={a.id} attachment={a} onDone={onDone} />
          ))}
        </ul>
      ) : null}
      <p className="rm-tl__recorded">
        {t("resumatch.tl.recorded")} <ZonedTimeText iso={entry.createdAt} timeZone={null} />
      </p>

      {error ? (
        <Alert tone="error">
          <p>{error}</p>
        </Alert>
      ) : null}

      {adding ? (
        <div className="rm-tl__add-files">
          <AttachmentPicker files={files} onChange={setFiles} already={entry.attachments.length} testId="entry-files" />
          <div className="rm-tl-form__actions">
            <Button type="button" size="sm" onClick={() => void upload()} disabled={busy || files.length === 0} data-testid="entry-files-save">
              {busy ? t("resumatch.tl.saving") : t("resumatch.tl.files.save")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(false)} disabled={busy}>
              {t("resumatch.tl.cancel")}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="rm-tl__actions">
        {entry.isRecordedSubmission ? (
          <a className="ui-btn ui-btn--ghost ui-btn--sm" href={`/applications/${encodeURIComponent(applicationId)}/external`} data-testid="entry-edit-submission">
            {t("resumatch.tl.editRecorded")}
          </a>
        ) : (
          <>
            <Button type="button" variant="ghost" size="sm" onClick={onEdit} data-testid="entry-edit">
              {t("resumatch.tl.edit")}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmDelete(true)} data-testid="entry-delete">
              {t("resumatch.tl.delete")}
            </Button>
          </>
        )}
        {!adding && entry.attachments.length < MAX_ATTACHMENTS_PER_EVENT ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setAdding(true)} data-testid="entry-add-files">
            {t("resumatch.tl.files.add")}
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("resumatch.tl.deleteTitle")}
        message={entry.toStatus ? t("resumatch.tl.deleteBodyStatus") : t("resumatch.tl.deleteBody")}
        confirmLabel={t("resumatch.tl.delete")}
        cancelLabel={t("resumatch.tl.keep")}
        tone="danger"
        confirmDisabled={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}

function AttachmentItem({ attachment, onDone }: { attachment: AttachmentView; onDone: (message: string) => void }) {
  const { t } = useTranslation();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const href = `/api/application-attachments/${encodeURIComponent(attachment.id)}`;
  const preview = attachment.emailPreview;

  async function remove() {
    setBusy(true);
    const result = await sendTimelineRequest(href, "DELETE");
    setBusy(false);
    setConfirm(false);
    if (result.ok) onDone(t("resumatch.tl.files.deleted"));
    else setError(result.data.error ?? t("resumatch.tl.error.save"));
  }

  return (
    <li className="rm-tl__attachment" data-testid="entry-attachment" data-attachment-kind={attachment.kind}>
      <div className="rm-tl__attachment-row">
        <span>
          {t(`resumatch.tl.files.kind.${attachment.kind}`)}: {attachment.filename} <span className="rm-tl-hint">({formatBytes(attachment.byteSize)})</span>
        </span>
        {attachment.kind !== "EMAIL" ? (
          <a href={href} target="_blank" rel="noopener noreferrer" data-testid="attachment-open">
            {t("resumatch.tl.files.open")}
          </a>
        ) : null}
        <a href={`${href}?download=1`} data-testid="attachment-download">
          {t("resumatch.tl.files.download")}
        </a>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(true)} data-testid="attachment-delete">
          {t("resumatch.tl.files.delete")}
        </Button>
      </div>
      {attachment.kind === "IMAGE" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rm-tl__thumb" src={href} alt={t("resumatch.tl.files.screenshotAlt", { name: attachment.filename })} loading="lazy" />
      ) : null}
      {preview ? (
        <details className="rm-tl__eml" data-testid="eml-preview">
          <summary>{preview.subject ?? t("resumatch.tl.files.emailNoSubject")}</summary>
          <dl className="rm-tl__eml-headers">
            {preview.from ? (
              <div>
                <dt>{t("resumatch.tl.files.emailFrom")}</dt>
                <dd>{preview.from}</dd>
              </div>
            ) : null}
            {preview.to ? (
              <div>
                <dt>{t("resumatch.tl.files.emailTo")}</dt>
                <dd>{preview.to}</dd>
              </div>
            ) : null}
            {preview.date ? (
              <div>
                <dt>{t("resumatch.tl.files.emailDate")}</dt>
                <dd>{preview.date}</dd>
              </div>
            ) : null}
          </dl>
          <pre className="rm-tl__eml-body" data-testid="eml-text">
            {preview.text || t("resumatch.tl.files.emailEmpty")}
          </pre>
          {preview.fromHtml || preview.truncated || preview.attachedFiles > 0 ? (
            <p className="rm-tl-hint">
              {[
                preview.fromHtml ? t("resumatch.tl.files.emailFromHtml") : null,
                preview.truncated ? t("resumatch.tl.files.emailTruncated") : null,
                preview.attachedFiles > 0 ? t("resumatch.tl.files.emailAttached", { count: preview.attachedFiles }) : null,
              ]
                .filter(Boolean)
                .join(" ")}
            </p>
          ) : null}
        </details>
      ) : null}
      {error ? <p className="rm-field-error">{error}</p> : null}
      <ConfirmDialog
        open={confirm}
        title={t("resumatch.tl.files.deleteTitle")}
        message={t("resumatch.tl.files.deleteBody", { name: attachment.filename })}
        confirmLabel={t("resumatch.tl.files.delete")}
        cancelLabel={t("resumatch.tl.keep")}
        tone="danger"
        confirmDisabled={busy}
        onConfirm={() => void remove()}
        onCancel={() => setConfirm(false)}
      />
    </li>
  );
}

"use client";

import { useEffect, useId, useState } from "react";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button } from "@asafarim/ui";
import { APPLICATION_STATUSES, type ApplicationStatusName } from "../../lib/applications/constants";
import { EVENT_KINDS, NEXT_ACTION_MAX, PARTY_MAX, SUMMARY_MAX, type EventKindName } from "../../lib/applications/timeline/contract";
import { checkAttachmentSelection } from "../../lib/applications/timeline/attachments";
import { FOLLOW_UP_MAX_DAY, FOLLOW_UP_MIN_DAY } from "../../lib/applications/followUp";
import { runtimeTimeZone, utcToZonedLocal, zonedLocalToUtc } from "../../lib/applications/zonedTime";
import { AttachmentPicker } from "./AttachmentPicker";
import { newClientKey, sendTimelineRequest } from "./client";
import { ZonedDateTimeField, type ZonedValue } from "./ZonedDateTimeField";

export interface EventFormInitial {
  kind: EventKindName;
  occurredAt: string;
  timeZone: string;
  summary: string | null;
  sender: string | null;
  recipient: string | null;
  nextAction: string | null;
  followUpDay: string | null;
}

/**
 * "Add update" and an entry's Edit (application-timeline.md). The status
 * never changes unless "Change status" names a new one; it defaults to no
 * change for every type, including Interview and Offer. Editing an entry
 * can't change status at all: the change it made is history.
 */
export function EventForm({
  applicationId,
  eventId,
  initial,
  currentStatus,
  onSaved,
  onCancel,
}: {
  applicationId: string;
  /** Set when editing. */
  eventId?: string;
  initial?: EventFormInitial;
  currentStatus: ApplicationStatusName;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const ids = { kind: useId(), summary: useId(), sender: useId(), recipient: useId(), next: useId(), follow: useId(), status: useId() };
  const editing = Boolean(eventId);
  const [clientKey] = useState(newClientKey);
  const [ready, setReady] = useState(false);
  const [kind, setKind] = useState<EventKindName>(initial?.kind ?? "RECRUITER_REPLY");
  const [at, setAt] = useState<ZonedValue>({ local: "", timeZone: "UTC" });
  const [summary, setSummary] = useState(initial?.summary ?? "");
  const [sender, setSender] = useState(initial?.sender ?? "");
  const [recipient, setRecipient] = useState(initial?.recipient ?? "");
  const [nextAction, setNextAction] = useState(initial?.nextAction ?? "");
  const [followUp, setFollowUp] = useState(initial?.followUpDay ?? "");
  const [statusChange, setStatusChange] = useState<ApplicationStatusName | "">("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [atError, setAtError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const zone = initial?.timeZone ?? runtimeTimeZone();
    setAt({ local: utcToZonedLocal(initial?.occurredAt ?? new Date().toISOString(), zone), timeZone: zone });
    setReady(true);
  }, [initial?.occurredAt, initial?.timeZone]);

  async function save() {
    if (saving) return;
    if (!zonedLocalToUtc(at.local, at.timeZone)) {
      setAtError(t("resumatch.tl.error.dateTime"));
      return;
    }
    if (checkAttachmentSelection(files)) return;
    setAtError(null);
    setError(null);
    setSaving(true);
    const fields = {
      kind,
      occurredAt: at,
      summary,
      sender,
      recipient,
      nextAction,
      followUpDate: followUp || null,
    };
    const base = `/api/applications/${encodeURIComponent(applicationId)}/events`;
    const result = editing
      ? await sendTimelineRequest(`${base}/${encodeURIComponent(eventId ?? "")}`, "PATCH", fields)
      : await sendTimelineRequest(base, "POST", { ...fields, clientKey, statusChange: statusChange || null }, files);
    setSaving(false);
    if (result.ok) {
      onSaved();
      return;
    }
    setError(result.data.error ?? (result.status === 0 ? t("resumatch.tl.error.network") : t("resumatch.tl.error.save")));
  }

  if (!ready) return <p className="rm-tl-hint" role="status">{t("resumatch.tl.loading")}</p>;

  return (
    <form
      className="rm-tl-form rm-tl-form--event"
      noValidate
      aria-busy={saving || undefined}
      data-testid={editing ? "event-edit-form" : "event-add-form"}
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="jm-field" htmlFor={ids.kind}>
        <span>{t("resumatch.tl.event.kind")}</span>
        <select id={ids.kind} className="ui-input" value={kind} onChange={(e) => setKind(e.target.value as EventKindName)} data-testid="event-kind">
          {EVENT_KINDS.map((option) => (
            <option key={option} value={option}>
              {t(`resumatch.tl.kind.${option}`)}
            </option>
          ))}
        </select>
      </label>

      <ZonedDateTimeField label={t("resumatch.tl.event.when")} value={at} onChange={setAt} error={atError} testId="event-at" />

      <label className="jm-field" htmlFor={ids.summary}>
        <span>
          {t("resumatch.tl.event.summary")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
        </span>
        <textarea
          id={ids.summary}
          className="ui-input"
          rows={5}
          value={summary}
          maxLength={SUMMARY_MAX}
          onChange={(e) => setSummary(e.target.value)}
          data-testid="event-summary"
        />
        <span className="rm-tl-hint">{t("resumatch.tl.event.summaryHint")}</span>
      </label>

      <div className="rm-tl-form__pair">
        <label className="jm-field" htmlFor={ids.sender}>
          <span>
            {t("resumatch.tl.event.sender")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
          </span>
          <input id={ids.sender} className="ui-input" value={sender} maxLength={PARTY_MAX} onChange={(e) => setSender(e.target.value)} data-testid="event-sender" />
        </label>
        <label className="jm-field" htmlFor={ids.recipient}>
          <span>
            {t("resumatch.tl.event.recipient")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
          </span>
          <input
            id={ids.recipient}
            className="ui-input"
            value={recipient}
            maxLength={PARTY_MAX}
            onChange={(e) => setRecipient(e.target.value)}
            data-testid="event-recipient"
          />
        </label>
      </div>

      {!editing ? <AttachmentPicker files={files} onChange={setFiles} testId="event-files" /> : null}

      <div className="rm-tl-form__pair">
        <label className="jm-field" htmlFor={ids.next}>
          <span>
            {t("resumatch.tl.event.nextAction")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
          </span>
          <input
            id={ids.next}
            className="ui-input"
            value={nextAction}
            maxLength={NEXT_ACTION_MAX}
            onChange={(e) => setNextAction(e.target.value)}
            data-testid="event-next-action"
          />
        </label>
        <label className="jm-field" htmlFor={ids.follow}>
          <span>
            {t("resumatch.tl.event.followUp")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
          </span>
          <input
            id={ids.follow}
            className="ui-input"
            type="date"
            min={FOLLOW_UP_MIN_DAY}
            max={FOLLOW_UP_MAX_DAY}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            data-testid="event-follow-up"
          />
          <span className="rm-tl-hint">{t("resumatch.tl.event.followUpHint")}</span>
        </label>
      </div>

      {!editing ? (
        <label className="jm-field" htmlFor={ids.status}>
          <span>{t("resumatch.tl.event.statusChange")}</span>
          <select
            id={ids.status}
            className="ui-input"
            value={statusChange}
            onChange={(e) => setStatusChange(e.target.value as ApplicationStatusName | "")}
            data-testid="event-status-change"
          >
            <option value="">{t("resumatch.tl.event.noStatusChange", { status: t(`resumatch.app.status.${currentStatus}`) })}</option>
            {APPLICATION_STATUSES.filter((s) => s !== currentStatus).map((s) => (
              <option key={s} value={s}>
                {t("resumatch.tl.event.changeTo", { status: t(`resumatch.app.status.${s}`) })}
              </option>
            ))}
          </select>
          <span className="rm-tl-hint">{t("resumatch.tl.event.statusHint")}</span>
        </label>
      ) : (
        <p className="rm-tl-hint">{t("resumatch.tl.event.statusNotEditable")}</p>
      )}

      {error ? (
        <Alert tone="error">
          <p data-testid="event-error">{error}</p>
        </Alert>
      ) : null}

      <div className="rm-tl-form__actions">
        <Button type="submit" disabled={saving} data-testid="event-save">
          {saving ? t("resumatch.tl.saving") : editing ? t("resumatch.tl.event.saveEdit") : t("resumatch.tl.event.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
          {t("resumatch.tl.cancel")}
        </Button>
      </div>
    </form>
  );
}

"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, ConfirmDialog } from "@asafarim/ui";
import type { ApplicationStatusName } from "../../lib/applications/constants";
import {
  CHANNEL_LABEL_MAX,
  REFERENCE_MAX,
  SUBMISSION_CHANNELS,
  SUMMARY_MAX,
  URL_MAX,
  normalizeHttpUrl,
  type SubmissionChannelName,
} from "../../lib/applications/timeline/contract";
import { checkAttachmentSelection } from "../../lib/applications/timeline/attachments";
import { FOLLOW_UP_MAX_DAY, FOLLOW_UP_MIN_DAY } from "../../lib/applications/followUp";
import { runtimeTimeZone, utcToZonedLocal, zonedLocalToUtc } from "../../lib/applications/zonedTime";
import { AttachmentPicker } from "./AttachmentPicker";
import { newClientKey, sendTimelineRequest } from "./client";
import { ZonedDateTimeField, type ZonedValue } from "./ZonedDateTimeField";

export interface ExternalSubmissionFormProps {
  applicationId: string;
  mode: "record" | "edit";
  initial: {
    appliedAt: string | null;
    timeZone: string | null;
    channel: SubmissionChannelName | null;
    channelLabel: string | null;
    applicationUrl: string | null;
    reference: string | null;
    notes: string | null;
  };
  /** The saved job's web address, when it has one. */
  prefillUrl: string | null;
  status: ApplicationStatusName;
  /** An accepted ResuMatch email keeps the application Applied on undo. */
  hasAcceptedEmail: boolean;
}

type Errors = Partial<Record<"appliedAt" | "channel" | "channelLabel" | "applicationUrl" | "confirmationAt" | "form", string>>;

/**
 * "Mark as applied externally" and "Edit recorded details"
 * (application-timeline.md). Saving moves a Saved application to Applied;
 * no recipient, no PDFs, no email record. One client key per form: a
 * second click, or a retry after a dropped connection, finds the first
 * save instead of recording twice.
 */
export function ExternalSubmissionForm(props: ExternalSubmissionFormProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const ids = { notes: useId(), conf: useId(), url: useId(), ref: useId(), label: useId(), follow: useId() };
  const [ready, setReady] = useState(false);
  const [clientKey] = useState(newClientKey);
  const [applied, setApplied] = useState<ZonedValue>({ local: "", timeZone: "UTC" });
  const [channel, setChannel] = useState<SubmissionChannelName | null>(props.initial.channel);
  const [channelLabel, setChannelLabel] = useState(props.initial.channelLabel ?? "");
  const [applicationUrl, setApplicationUrl] = useState(props.initial.applicationUrl ?? props.prefillUrl ?? "");
  const [reference, setReference] = useState(props.initial.reference ?? "");
  const [notes, setNotes] = useState(props.initial.notes ?? "");
  const [followUp, setFollowUp] = useState("");
  const [confirmationText, setConfirmationText] = useState("");
  const [confirmationAt, setConfirmationAt] = useState<ZonedValue>({ local: "", timeZone: "UTC" });
  const [files, setFiles] = useState<File[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [phase, setPhase] = useState<"idle" | "saving" | "undoing">("idle");
  const [undoOpen, setUndoOpen] = useState(false);

  // The browser's zone and "now" are only known here, never on the server.
  useEffect(() => {
    const zone = props.initial.timeZone ?? runtimeTimeZone();
    const at = props.initial.appliedAt ?? new Date().toISOString();
    setApplied({ local: utcToZonedLocal(at, zone), timeZone: zone });
    setConfirmationAt({ local: "", timeZone: zone });
    setReady(true);
  }, [props.initial.appliedAt, props.initial.timeZone]);

  const hasConfirmation = confirmationText.trim() !== "" || files.length > 0;

  function validate(): Errors {
    const next: Errors = {};
    const at = zonedLocalToUtc(applied.local, applied.timeZone);
    if (!at) next.appliedAt = t("resumatch.tl.error.dateTime");
    else if (at.getTime() > Date.now() + 10 * 60_000) next.appliedAt = t("resumatch.tl.error.future");
    if (!channel) next.channel = t("resumatch.tl.error.channel");
    if (channel === "OTHER" && channelLabel.trim() === "") next.channelLabel = t("resumatch.tl.error.channelLabel");
    if (applicationUrl.trim() !== "" && !normalizeHttpUrl(applicationUrl)) next.applicationUrl = t("resumatch.tl.error.url");
    if (props.mode === "record" && confirmationAt.local !== "" && !zonedLocalToUtc(confirmationAt.local, confirmationAt.timeZone)) {
      next.confirmationAt = t("resumatch.tl.error.dateTime");
    }
    return next;
  }

  async function save() {
    if (phase !== "idle") return;
    const found = validate();
    if (Object.keys(found).length > 0 || checkAttachmentSelection(files)) {
      setErrors(found);
      return;
    }
    setErrors({});
    setPhase("saving");
    const common = {
      appliedAt: applied,
      channel,
      channelLabel: channel === "OTHER" ? channelLabel : null,
      applicationUrl,
      reference,
      notes,
    };
    const result =
      props.mode === "record"
        ? await sendTimelineRequest(
            `/api/applications/${encodeURIComponent(props.applicationId)}/submission`,
            "POST",
            {
              ...common,
              clientKey,
              followUpDate: followUp || null,
              confirmationText: hasConfirmation ? confirmationText : null,
              confirmationAt: hasConfirmation && confirmationAt.local ? confirmationAt : null,
            },
            files,
          )
        : await sendTimelineRequest(`/api/applications/${encodeURIComponent(props.applicationId)}/submission`, "PATCH", common);
    if (result.ok) {
      router.push(`/applications/${encodeURIComponent(props.applicationId)}/timeline?${props.mode === "record" ? "recorded" : "edited"}=1`);
      router.refresh();
      return;
    }
    setPhase("idle");
    setErrors({ form: result.data.error ?? (result.status === 0 ? t("resumatch.tl.error.network") : t("resumatch.tl.error.save")) });
  }

  async function undo() {
    setPhase("undoing");
    const result = await sendTimelineRequest(`/api/applications/${encodeURIComponent(props.applicationId)}/submission`, "DELETE");
    setUndoOpen(false);
    if (result.ok) {
      router.push(`/applications/${encodeURIComponent(props.applicationId)}/timeline?undone=1`);
      router.refresh();
      return;
    }
    setPhase("idle");
    setErrors({ form: result.data.error ?? t("resumatch.tl.error.save") });
  }

  if (!ready) {
    return <p className="rm-tl-hint" role="status">{t("resumatch.tl.loading")}</p>;
  }

  const busy = phase !== "idle";
  const statusNote =
    props.status === "SAVED" ? t("resumatch.tl.ext.statusWillApply") : t("resumatch.tl.ext.statusKept", { status: t(`resumatch.app.status.${props.status}`) });

  return (
    <form
      className="rm-tl-form"
      noValidate
      aria-busy={busy || undefined}
      data-testid="external-form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <p className="rm-tl-hint" data-testid="external-status-note">
        {statusNote} {t("resumatch.tl.ext.noEmail")}
      </p>

      <ZonedDateTimeField
        label={t("resumatch.tl.ext.appliedAt")}
        value={applied}
        onChange={setApplied}
        hint={t("resumatch.tl.ext.appliedAtHint")}
        error={errors.appliedAt}
        testId="external-applied"
      />

      <fieldset className="rm-tl-channels" aria-describedby={errors.channel ? `${ids.label}-err` : undefined}>
        <legend>{t("resumatch.tl.ext.channel")}</legend>
        <div className="rm-tl-channels__options">
          {SUBMISSION_CHANNELS.map((option) => (
            <label key={option} className="rm-tl-radio">
              <input
                type="radio"
                name="channel"
                value={option}
                checked={channel === option}
                onChange={() => setChannel(option)}
                data-testid={`external-channel-${option}`}
              />
              <span>{t(`resumatch.tl.channel.${option}`)}</span>
            </label>
          ))}
        </div>
        {errors.channel ? (
          <p className="rm-field-error" id={`${ids.label}-err`}>
            {errors.channel}
          </p>
        ) : null}
        {channel === "OTHER" ? (
          <label className="jm-field" htmlFor={ids.label}>
            <span>{t("resumatch.tl.ext.channelLabel")}</span>
            <input
              id={ids.label}
              className="ui-input"
              value={channelLabel}
              maxLength={CHANNEL_LABEL_MAX}
              onChange={(e) => setChannelLabel(e.target.value)}
              aria-invalid={errors.channelLabel ? true : undefined}
              data-testid="external-channel-label"
            />
            {errors.channelLabel ? <span className="rm-field-error">{errors.channelLabel}</span> : null}
          </label>
        ) : null}
      </fieldset>

      <label className="jm-field" htmlFor={ids.url}>
        <span>
          {t("resumatch.tl.ext.url")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
        </span>
        <input
          id={ids.url}
          className="ui-input"
          type="url"
          inputMode="url"
          value={applicationUrl}
          maxLength={URL_MAX}
          onChange={(e) => setApplicationUrl(e.target.value)}
          aria-invalid={errors.applicationUrl ? true : undefined}
          data-testid="external-url"
        />
        {props.prefillUrl && !props.initial.applicationUrl ? <span className="rm-tl-hint">{t("resumatch.tl.ext.urlPrefilled")}</span> : null}
        {errors.applicationUrl ? <span className="rm-field-error">{errors.applicationUrl}</span> : null}
      </label>

      <label className="jm-field" htmlFor={ids.ref}>
        <span>
          {t("resumatch.tl.ext.reference")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
        </span>
        <input
          id={ids.ref}
          className="ui-input"
          value={reference}
          maxLength={REFERENCE_MAX}
          onChange={(e) => setReference(e.target.value)}
          data-testid="external-reference"
        />
      </label>

      <label className="jm-field" htmlFor={ids.notes}>
        <span>
          {t("resumatch.tl.ext.notes")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
        </span>
        <textarea
          id={ids.notes}
          className="ui-input"
          rows={3}
          value={notes}
          maxLength={SUMMARY_MAX}
          onChange={(e) => setNotes(e.target.value)}
          data-testid="external-notes"
        />
      </label>

      {props.mode === "record" ? (
        <>
          <label className="jm-field" htmlFor={ids.follow}>
            <span>
              {t("resumatch.tl.ext.followUp")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
            </span>
            <input
              id={ids.follow}
              className="ui-input"
              type="date"
              min={FOLLOW_UP_MIN_DAY}
              max={FOLLOW_UP_MAX_DAY}
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              data-testid="external-follow-up"
            />
            <span className="rm-tl-hint">{t("resumatch.tl.ext.followUpHint")}</span>
          </label>

          <fieldset className="rm-tl-confirmation">
            <legend>
              {t("resumatch.tl.ext.confirmation")} <span className="rm-tl-optional">{t("resumatch.tl.optional")}</span>
            </legend>
            <p className="rm-tl-hint">{t("resumatch.tl.ext.confirmationHint")}</p>
            <label className="jm-field" htmlFor={ids.conf}>
              <span>{t("resumatch.tl.ext.confirmationText")}</span>
              <textarea
                id={ids.conf}
                className="ui-input"
                rows={4}
                value={confirmationText}
                maxLength={SUMMARY_MAX}
                onChange={(e) => setConfirmationText(e.target.value)}
                data-testid="external-confirmation-text"
              />
            </label>
            <AttachmentPicker files={files} onChange={setFiles} testId="external-files" />
            {hasConfirmation ? (
              <ZonedDateTimeField
                label={t("resumatch.tl.ext.confirmationAt")}
                value={confirmationAt}
                onChange={setConfirmationAt}
                hint={t("resumatch.tl.ext.confirmationAtHint")}
                error={errors.confirmationAt}
                testId="external-confirmation-at"
                optional
              />
            ) : null}
          </fieldset>
        </>
      ) : (
        <p className="rm-tl-hint">
          {t("resumatch.tl.ext.editElsewhere")}{" "}
          <a href={`/applications/${encodeURIComponent(props.applicationId)}/timeline`}>{t("resumatch.tl.viewTimeline")}</a>
        </p>
      )}

      {errors.form ? (
        <Alert tone="error">
          <p data-testid="external-error">{errors.form}</p>
        </Alert>
      ) : null}

      <div className="rm-tl-form__actions">
        <Button type="submit" disabled={busy} data-testid="external-save">
          {phase === "saving" ? t("resumatch.tl.saving") : props.mode === "record" ? t("resumatch.tl.ext.save") : t("resumatch.tl.ext.saveEdit")}
        </Button>
        <a href="/applications" className="ui-btn ui-btn--ghost">
          {t("resumatch.tl.cancel")}
        </a>
        {props.mode === "edit" ? (
          <Button type="button" variant="ghost" disabled={busy} onClick={() => setUndoOpen(true)} data-testid="external-undo">
            {t("resumatch.tl.ext.undo")}
          </Button>
        ) : null}
      </div>

      <ConfirmDialog
        open={undoOpen}
        title={t("resumatch.tl.ext.undoTitle")}
        message={
          props.status === "APPLIED"
            ? props.hasAcceptedEmail
              ? t("resumatch.tl.ext.undoBodyEmail")
              : t("resumatch.tl.ext.undoBodySaved")
            : t("resumatch.tl.ext.undoBodyKept", { status: t(`resumatch.app.status.${props.status}`) })
        }
        confirmLabel={t("resumatch.tl.ext.undoConfirm")}
        cancelLabel={t("resumatch.tl.ext.undoCancel")}
        tone="danger"
        confirmDisabled={phase === "undoing"}
        onConfirm={() => void undo()}
        onCancel={() => setUndoOpen(false)}
      />
    </form>
  );
}

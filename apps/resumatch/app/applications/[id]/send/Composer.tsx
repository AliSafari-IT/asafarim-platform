"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, ConfirmDialog } from "@asafarim/ui";
import type { ApplicationStatusName } from "../../../../lib/applications/constants";
import {
  BODY_MAX_LENGTH,
  CONTACT_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  MAX_RECIPIENTS,
  SUBJECT_MAX_LENGTH,
  additionalRecipientProblems,
  recipientList,
  validateForSend,
  type DraftField,
  type FieldProblem,
} from "../../../../lib/applicationEmail/normalize";
import type { Prefill } from "../../../../lib/applicationEmail/prefill";
import type { PdfStatusView } from "../../../../lib/documentPdfs/describe";
import { LocalTime } from "../../../ai-usage/LocalTime";
import { ContactPreferencesFields, contactPreferencesProblem } from "../../../../components/contactPreferences/ContactPreferencesFields";
import {
  EMPTY_PREFERENCES,
  renderContactParagraph,
  resolveContactPreferences,
  swapContactParagraph,
  type ContactMode,
  type ContactPreferences,
} from "../../../../lib/contactPreferences/contract";
import type { OutputLanguage } from "../../../../lib/tailoring/language";

interface PinnedPdf {
  id: string;
  filename: string;
  byteSize: number;
  createdAt: string;
  current: boolean;
  newerAvailable: { id: string; filename: string; createdAt: string } | null;
}

interface DraftView {
  version: number;
  toEmail: string;
  additionalToEmails?: string[];
  contactName: string;
  subject: string;
  body: string;
  subjectEdited: boolean;
  bodyEdited: boolean;
  sendCopyToSelf: boolean;
  cvPdfId: string | null;
  coverLetterPdfId: string | null;
  contactMode: ContactMode;
  contactOverride: ContactPreferences | null;
  contactParagraph: string | null;
}

export interface ComposerProps {
  application: {
    id: string;
    status: ApplicationStatusName;
    appliedAt: string | null;
    jobTitle: string | null;
    employer: string | null;
    tailoredResumeId: string | null;
    coverLetterId: string | null;
  };
  problems: ("no_cv" | "no_cover_letter" | "pdfs_missing" | "pins_invalid")[];
  pdfs: PdfStatusView | null;
  attachments: { cv: PinnedPdf | null; letter: PinnedPdf | null };
  draft: DraftView | null;
  prefill: Prefill;
  lastSent: { id: string; status: string; attemptedAt: string; sentAt: string | null; contactEmail: string; additionalRecipients?: string[] } | null;
  unresolved: { id: string; status: "SENDING" | "UNCERTAIN"; attemptedAt: string; stale: boolean } | null;
  sendCount: number;
  sender: { available: boolean; from: string | null; replyTo: string | null };
  pdfRenderer: boolean;
  /** The email's language (#940): the contact paragraph is written in it. */
  emailLanguage: OutputLanguage;
  /** The saved contact preferences; null when none. */
  contactDefaults: ContactPreferences | null;
}

interface Fields {
  toEmail: string;
  /** Recipients 2 and 3 (#944), one entry per field shown; may be blank. */
  additionalToEmails: string[];
  contactName: string;
  subject: string;
  body: string;
  subjectEdited: boolean;
  bodyEdited: boolean;
  sendCopyToSelf: boolean;
}

type SendState =
  | { kind: "idle" }
  | { kind: "sending" }
  | { kind: "accepted"; sentId: string; status: ApplicationStatusName; recorded: boolean; to: string; rejected: string[] }
  | { kind: "failed"; sentId: string; code: string }
  | { kind: "uncertain"; sentId: string }
  | { kind: "in_progress" }
  | { kind: "network"; key: string }
  | { kind: "invalid"; reason: string };

function newKey(): string {
  return crypto.randomUUID();
}

function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/**
 * The application email composer. Every field is the candidate's to edit;
 * AI text arrives only on first open (empty draft) or when they ask for it,
 * and never replaces a hand edit without a confirmation. The draft is kept
 * through every failure: Save draft stores it, and Send stores it first.
 */
export function Composer(props: ComposerProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const ids = { to: useId(), name: useId(), subject: useId(), body: useId(), copy: useId(), sender: useId(), lock: useId() };
  const successRef = useRef<HTMLDivElement>(null);
  const resultRef = useRef<HTMLDivElement>(null);

  const initial: Fields = props.draft
    ? {
        toEmail: props.draft.toEmail,
        additionalToEmails: props.draft.additionalToEmails ?? [],
        contactName: props.draft.contactName,
        subject: props.draft.subject,
        body: props.draft.body,
        subjectEdited: props.draft.subjectEdited,
        bodyEdited: props.draft.bodyEdited,
        sendCopyToSelf: props.draft.sendCopyToSelf,
      }
    : {
        toEmail: props.prefill.toEmail,
        additionalToEmails: props.prefill.additionalToEmails ?? [],
        contactName: props.prefill.contactName,
        subject: "",
        body: "",
        subjectEdited: false,
        bodyEdited: false,
        sendCopyToSelf: true,
      };

  const [fields, setFields] = useState<Fields>(initial);
  const [saved, setSaved] = useState<Fields | null>(props.draft ? initial : null);
  const [version, setVersion] = useState<number | null>(props.draft?.version ?? null);
  const [pins, setPins] = useState({ cv: props.attachments.cv, letter: props.attachments.letter });
  const [savedPins, setSavedPins] = useState(
    props.draft ? { cv: props.draft.cvPdfId, letter: props.draft.coverLetterPdfId } : { cv: null as string | null, letter: null as string | null },
  );
  const [problems, setProblems] = useState<Partial<Record<DraftField, FieldProblem>>>({});
  /** A problem per extra recipient field, from the last send attempt. */
  const [extraProblems, setExtraProblems] = useState<(FieldProblem | null)[]>([]);
  /** The extra recipient field to focus once it is on screen. */
  const [focusExtra, setFocusExtra] = useState<number | null>(null);
  const [generating, setGenerating] = useState<null | "both" | "subject" | "body">(null);
  const [generateNote, setGenerateNote] = useState<{ tone: "info" | "error" | "warning"; text: string } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState<null | {
    part: "subject" | "body";
    subject: string;
    body: string;
    contactParagraph: string | null;
    /** A change of contact choice in an edited body: only that paragraph changes, the edits stay. */
    contactOnly?: boolean;
  }>(
    null,
  );
  const [saveState, setSaveState] = useState<{ kind: "idle" | "saving" | "saved" | "error" | "conflict"; text?: string }>({ kind: "idle" });
  const [send, setSend] = useState<SendState>({ kind: "idle" });
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [confirmResend, setConfirmResend] = useState(false);
  const [pdfPhase, setPdfPhase] = useState<"idle" | "creating" | "error">("idle");
  const [pdfError, setPdfError] = useState<{ text: string; code: string | null } | null>(null);
  const keyRef = useRef<string | null>(null);

  // Contact preferences (#940). The paragraph is built in code from the
  // chosen preferences; `contactParagraph` is the one this body holds, so a
  // change of choice can swap exactly that block while the body is the AI's.
  const initialContact = { mode: props.draft?.contactMode ?? ("DEFAULT" as ContactMode), override: props.draft?.contactOverride ?? null };
  const [contact, setContact] = useState(initialContact);
  const [savedContact, setSavedContact] = useState(initialContact);
  const [contactNote, setContactNote] = useState<string | null>(null);
  const paragraphFor = (mode: ContactMode, override: ContactPreferences | null) =>
    renderContactParagraph(resolveContactPreferences(mode, props.contactDefaults, override), props.emailLanguage);
  // A saved draft remembers the exact paragraph it holds, so it can still
  // be swapped or removed after the saved defaults change.
  const [contactParagraph, setContactParagraph] = useState<string | null>(() => {
    const blocks = initial.body.split("\n\n");
    const stored = props.draft?.contactParagraph ?? null;
    if (stored && blocks.includes(stored)) return stored;
    const paragraph = paragraphFor(initialContact.mode, initialContact.override);
    return paragraph && blocks.includes(paragraph) ? paragraph : null;
  });

  const blocked = props.problems.includes("no_cv") || props.problems.includes("no_cover_letter");
  const sending = send.kind === "sending";
  const busy = sending || generating !== null || saveState.kind === "saving";
  const subjectWriting = generating === "both" || generating === "subject";
  const bodyWriting = generating === "both" || generating === "body";
  const dirty =
    !saved ||
    saved.toEmail !== fields.toEmail ||
    saved.additionalToEmails.join("\n") !== fields.additionalToEmails.join("\n") ||
    saved.contactName !== fields.contactName ||
    saved.subject !== fields.subject ||
    saved.body !== fields.body ||
    saved.sendCopyToSelf !== fields.sendCopyToSelf ||
    savedPins.cv !== (pins.cv?.id ?? null) ||
    savedPins.letter !== (pins.letter?.id ?? null) ||
    savedContact.mode !== contact.mode ||
    // The override only counts while it is the choice: OMIT saves none.
    (contact.mode === "OVERRIDE" && JSON.stringify(savedContact.override) !== JSON.stringify(contact.override));
  const hasText = Boolean(fields.subject.trim() || fields.body.trim() || fields.toEmail.trim());
  const warnOnLeave = dirty && hasText && send.kind !== "accepted";

  useEffect(() => {
    if (!warnOnLeave) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [warnOnLeave]);

  const update = (patch: Partial<Fields>) => {
    setFields((current) => ({ ...current, ...patch }));
    if (saveState.kind === "saved") setSaveState({ kind: "idle" });
  };

  const generate = useCallback(
    async (part: "both" | "subject" | "body", opts: { force?: boolean } = {}) => {
      setGenerating(part);
      setGenerateNote(null);
      try {
        const res = await fetch(`/api/applications/${encodeURIComponent(props.application.id)}/email-draft/generate`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            contactName: fields.contactName,
            contactMode: contact.mode,
            ...(contact.mode === "OVERRIDE" && contact.override && !contactPreferencesProblem(contact.override) ? { contactOverride: contact.override } : {}),
            // An override still being typed: write without it for now.
            ...(contact.mode === "OVERRIDE" && (!contact.override || contactPreferencesProblem(contact.override)) ? { contactMode: "OMIT" } : {}),
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          subject?: string;
          body?: string;
          removed?: number;
          error?: string;
          contactParagraph?: string | null;
        };
        if (!res.ok || typeof data.subject !== "string" || typeof data.body !== "string") {
          setGenerateNote({ tone: "error", text: data.error ?? t("resumatch.send.generate.failed") });
          return;
        }
        const replaceSubject = part !== "body";
        const replaceBody = part !== "subject";
        // A hand-edited field is only replaced after the candidate says so.
        const needsConfirm =
          !opts.force &&
          ((replaceSubject && fields.subjectEdited && fields.subject.trim()) || (replaceBody && fields.bodyEdited && fields.body.trim()));
        if (needsConfirm && part !== "both") {
          setConfirmReplace({ part, subject: data.subject, body: data.body, contactParagraph: data.contactParagraph ?? null });
          return;
        }
        if (replaceBody && !(part === "both" && fields.bodyEdited && fields.body.trim())) {
          setContactParagraph(data.contactParagraph ?? null);
          setContactNote(null);
        }
        setFields((current) => ({
          ...current,
          ...(replaceSubject && !(part === "both" && current.subjectEdited && current.subject.trim()) ? { subject: data.subject!, subjectEdited: false } : {}),
          ...(replaceBody && !(part === "both" && current.bodyEdited && current.body.trim()) ? { body: data.body!, bodyEdited: false } : {}),
        }));
        setGenerateNote(
          data.removed && data.removed > 0
            ? { tone: "warning", text: t("resumatch.send.generate.removed", { count: data.removed }) }
            : { tone: "info", text: t("resumatch.send.generate.done") },
        );
      } catch {
        setGenerateNote({ tone: "error", text: t("resumatch.send.generate.failed") });
      } finally {
        setGenerating(null);
      }
    },
    [fields.contactName, fields.subject, fields.body, fields.subjectEdited, fields.bodyEdited, props.application.id, t, contact],
  );

  // First open with no draft: write a subject and message straight away.
  const autoGenerated = useRef(false);
  useEffect(() => {
    if (autoGenerated.current || props.draft || blocked) return;
    autoGenerated.current = true;
    void generate("both");
  }, [props.draft, blocked, generate]);

  function draftPayload(overrideVersion?: number | null) {
    return {
      toEmail: fields.toEmail,
      additionalToEmails: fields.additionalToEmails,
      contactName: fields.contactName,
      subject: fields.subject,
      body: fields.body,
      subjectEdited: fields.subjectEdited,
      bodyEdited: fields.bodyEdited,
      sendCopyToSelf: fields.sendCopyToSelf,
      cvPdfId: pins.cv?.id ?? null,
      coverLetterPdfId: pins.letter?.id ?? null,
      contactMode: contact.mode,
      ...(contact.mode === "OVERRIDE" ? { contactOverride: contact.override } : {}),
      contactParagraph,
      version: overrideVersion !== undefined ? overrideVersion : version,
    };
  }

  function markSaved(draft: DraftView) {
    setVersion(draft.version);
    setSaved({ ...fields });
    setSavedPins({ cv: draft.cvPdfId, letter: draft.coverLetterPdfId });
    setSavedContact({ mode: draft.contactMode, override: draft.contactOverride });
  }

  /** A new choice of contact preferences: swaps the paragraph in a body the
   *  candidate hasn't edited; an edited body is left alone, with a note. */
  function changeContact(mode: ContactMode, override: ContactPreferences | null) {
    setContact({ mode, override });
    if (saveState.kind === "saved") setSaveState({ kind: "idle" });
    if (mode === "OVERRIDE" && (!override || contactPreferencesProblem(override))) return;
    const next = paragraphFor(mode, override);
    if (next === contactParagraph || !fields.body.trim()) return;
    const swapped = swapContactParagraph(fields.body, contactParagraph, next);
    if (swapped === null) {
      setContactNote(t("resumatch.contact.composer.edited"));
      return;
    }
    if (fields.bodyEdited) {
      // Hand edits: ask first, through the same step a regenerate uses.
      setConfirmReplace({ part: "body", subject: fields.subject, body: swapped, contactParagraph: next, contactOnly: true });
      return;
    }
    setContactNote(null);
    setContactParagraph(next);
    setFields((current) => ({ ...current, body: swapped }));
  }

  async function saveDraft(overrideVersion?: number | null) {
    setSaveState({ kind: "saving" });
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(props.application.id)}/email-draft`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draftPayload(overrideVersion)),
      });
      const data = (await res.json().catch(() => ({}))) as { draft?: DraftView; current?: DraftView | null; error?: string };
      if (res.ok && data.draft) {
        markSaved(data.draft);
        setSaveState({ kind: "saved" });
        return;
      }
      if (res.status === 409) {
        setSaveState({ kind: "conflict", text: data.current ? String(data.current.version) : undefined });
        if (data.current) setVersion(data.current.version);
        return;
      }
      setSaveState({ kind: "error", text: data.error ?? t("resumatch.send.save.failed") });
    } catch {
      setSaveState({ kind: "error", text: t("resumatch.send.save.failed") });
    }
  }

  function focusFirstProblem(found: Partial<Record<DraftField, FieldProblem>>) {
    const order: DraftField[] = ["toEmail", "additionalToEmails", "contactName", "subject", "body"];
    const first = order.find((field) => found[field]);
    if (first === "additionalToEmails") {
      const index = additionalRecipientProblems(fields).findIndex((p) => p !== null);
      document.getElementById(`${ids.to}-extra-${Math.max(0, index)}`)?.focus();
      return;
    }
    const target = first === "toEmail" ? ids.to : first === "contactName" ? ids.name : first === "subject" ? ids.subject : first === "body" ? ids.body : null;
    if (target) document.getElementById(target)?.focus();
  }

  async function doSend(opts: { confirmResend?: boolean; reuseKey?: string } = {}) {
    const found = validateForSend(fields);
    setProblems(found);
    setExtraProblems(additionalRecipientProblems(fields));
    if (Object.keys(found).length > 0) {
      focusFirstProblem(found);
      return;
    }
    if (!pins.cv || !pins.letter) {
      setSend({ kind: "invalid", reason: "attachments" });
      return;
    }
    // An earlier send that may have gone out: only an explicit "send
    // again" may risk a second copy.
    const mayHaveSent = props.unresolved !== null || send.kind === "uncertain" || (send.kind === "invalid" && send.reason === "unresolved_send");
    if (mayHaveSent && !opts.confirmResend && !opts.reuseKey) {
      setConfirmResend(true);
      return;
    }
    // One key per send intent. A lost response is retried with the same
    // key, so the server can tell a retry from a second email.
    const key = opts.reuseKey ?? newKey();
    keyRef.current = key;
    setSend({ kind: "sending" });
    try {
      const res = await fetch(`/api/applications/${encodeURIComponent(props.application.id)}/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ draft: draftPayload(), idempotencyKey: key, confirmResend: opts.confirmResend ?? false }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            outcome?: string;
            sentId?: string;
            applicationStatus?: ApplicationStatusName;
            recorded?: boolean;
            rejectedRecipients?: string[];
            errorCode?: string;
            reason?: string;
            fields?: Partial<Record<DraftField, FieldProblem>>;
            draft?: DraftView | null;
          }
        | null;
      if (!data) {
        setSend({ kind: "network", key });
        return;
      }
      if (data.draft) markSaved(data.draft);
      if (data.outcome === "accepted" && data.sentId) {
        setSend({ kind: "accepted", sentId: data.sentId, status: data.applicationStatus ?? "APPLIED", recorded: data.recorded !== false,
          to: recipientList(fields).join(", "),
          rejected: Array.isArray(data.rejectedRecipients) ? data.rejectedRecipients : [],
        });
        setSaveState({ kind: "idle" });
        router.refresh();
        return;
      }
      if (data.outcome === "failed" && data.sentId) return setSend({ kind: "failed", sentId: data.sentId, code: data.errorCode ?? "UNKNOWN" });
      if (data.outcome === "uncertain" && data.sentId) return setSend({ kind: "uncertain", sentId: data.sentId });
      if (data.outcome === "in_progress") return setSend({ kind: "in_progress" });
      if (data.reason === "fields" && data.fields) {
        setProblems(data.fields);
        setExtraProblems(additionalRecipientProblems(fields));
        focusFirstProblem(data.fields);
        setSend({ kind: "idle" });
        return;
      }
      if (data.reason === "draft_conflict" && data.draft) setVersion(data.draft.version);
      setSend({ kind: "invalid", reason: data.reason ?? "error" });
    } catch {
      // No answer at all: the email may or may not have been sent. Retrying
      // with the same key is safe.
      setSend({ kind: "network", key });
    }
  }

  // Move focus to the outcome so a keyboard or screen-reader user hears it.
  useEffect(() => {
    if (send.kind === "accepted") successRef.current?.focus();
    else if (send.kind !== "idle" && send.kind !== "sending") resultRef.current?.focus();
  }, [send.kind]);

  async function createPdfs() {
    if (!props.application.tailoredResumeId) return;
    setPdfPhase("creating");
    setPdfError(null);
    try {
      const res = await fetch(`/api/tailor/${encodeURIComponent(props.application.tailoredResumeId)}/pdfs`, { method: "POST" });
      const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string; pdfs?: PdfStatusView };
      if (!res.ok || !data.pdfs) {
        setPdfPhase("error");
        setPdfError({ text: data.error ?? t("resumatch.send.entry.pdfFailed"), code: data.code ?? (res.ok ? null : `http_${res.status}`) });
        return;
      }
      // The candidate asked for new PDFs, so they become the attachments;
      // that is the one place a pin changes, and only on their click.
      const toPin = (pdf: PdfStatusView["cv"]): PinnedPdf | null =>
        pdf ? { id: pdf.id, filename: pdf.filename, byteSize: pdf.byteSize, createdAt: pdf.createdAt, current: pdf.current, newerAvailable: null } : null;
      setPins({ cv: toPin(data.pdfs.cv), letter: toPin(data.pdfs.letter) });
      setPdfPhase("idle");
    } catch {
      setPdfPhase("error");
      setPdfError({ text: t("resumatch.send.entry.pdfFailed"), code: "network" });
    }
  }

  // An application saved before its PDFs existed (or whose PDFs could not
  // be made at save time) still opens ready to send: the missing PDFs are
  // made once, as the composer opens, and become the attachments.
  const autoCreated = useRef(false);
  useEffect(() => {
    if (autoCreated.current || blocked || !props.pdfRenderer) return;
    if (pins.cv && pins.letter) return;
    autoCreated.current = true;
    void createPdfs();
    // Only on open; later changes are the candidate's own clicks.
  }, []);

  function pickNewer(kind: "cv" | "letter") {
    const pin = pins[kind];
    if (!pin?.newerAvailable) return;
    const next = pin.newerAvailable;
    setPins((current) => ({ ...current, [kind]: { id: next.id, filename: next.filename, byteSize: pin.byteSize, createdAt: next.createdAt, current: true, newerAvailable: null } }));
  }

  // Extra recipients (#944): one field per recipient after the first.
  function setExtra(index: number, value: string) {
    update({ additionalToEmails: fields.additionalToEmails.map((v, i) => (i === index ? value : v)) });
    if (extraProblems[index]) setExtraProblems((current) => current.map((p, i) => (i === index ? null : p)));
  }
  function addExtra() {
    if (1 + fields.additionalToEmails.length >= MAX_RECIPIENTS) return;
    update({ additionalToEmails: [...fields.additionalToEmails, ""] });
    setFocusExtra(fields.additionalToEmails.length);
  }
  function removeExtra(index: number) {
    update({ additionalToEmails: fields.additionalToEmails.filter((_, i) => i !== index) });
    setExtraProblems((current) => current.filter((_, i) => i !== index));
    setProblems((current) => ({ ...current, additionalToEmails: undefined }));
    // Keep the keyboard where it was: on the add link, else the first field.
    setTimeout(() => (document.querySelector<HTMLElement>("[data-testid=add-recipient]") ?? document.getElementById(ids.to))?.focus(), 0);
  }
  // A job-posting address fills the first empty recipient field: the To
  // field, then an empty extra one, then a new one while there is room.
  const usedRecipients = new Set(recipientList(fields).map((a) => a.toLowerCase()));
  const unusedSuggestions = props.prefill.suggestions.filter((a) => !usedRecipients.has(a.toLowerCase()));
  const emptyExtra = fields.additionalToEmails.findIndex((v) => !v.trim());
  const suggestionSlot: "to" | number | null = !fields.toEmail.trim() ? "to" : emptyExtra >= 0 ? emptyExtra : null;
  function pickSuggestion(address: string) {
    if (suggestionSlot === "to") update({ toEmail: address });
    else if (typeof suggestionSlot === "number") setExtra(suggestionSlot, address);
  }
  useEffect(() => {
    if (focusExtra === null) return;
    document.getElementById(`${ids.to}-extra-${focusExtra}`)?.focus();
    setFocusExtra(null);
  }, [focusExtra, ids.to]);

  function leave() {
    if (warnOnLeave) setConfirmLeave(true);
    else router.push("/applications");
  }

  const problemText = (field: DraftField) => {
    const problem = problems[field];
    return problem ? t(`resumatch.send.field.${field}.${problem}`) : null;
  };

  const sendLocked = !props.sender.available || blocked || !pins.cv || !pins.letter || busy || pdfPhase === "creating" || send.kind === "accepted";
  // Why Send is off, said next to the button: a greyed-out button with the
  // reason only in a banner at the top of the page reads as broken.
  const lockReason: string | null =
    send.kind === "accepted" || sending
      ? null
      : !props.sender.available
        ? t("resumatch.send.locked.notConfigured")
        : pdfPhase === "creating"
          ? t("resumatch.send.locked.pdfsCreating")
          : !pins.cv || !pins.letter
            ? t("resumatch.send.locked.pdfsMissing")
            : generating
              ? t("resumatch.send.locked.writing")
              : saveState.kind === "saving"
                ? t("resumatch.send.locked.saving")
                : null;

  if (blocked) {
    return (
      <Alert tone="info">
        <p>{props.problems.includes("no_cv") ? t("resumatch.send.blocked.noCv") : t("resumatch.send.blocked.noLetter")}</p>
        <p>
          {props.problems.includes("no_cv") ? (
            <a href="/tailor">{t("resumatch.send.blocked.tailor")}</a>
          ) : (
            <a href={`/tailor?from=${encodeURIComponent(props.application.tailoredResumeId ?? "")}&letter=1#tailor-flow`}>{t("resumatch.send.entry.addLetter")}</a>
          )}{" "}
          · <a href="/applications">{t("resumatch.send.back")}</a>
        </p>
      </Alert>
    );
  }

  return (
    <div className="rm-composer" aria-busy={busy || pdfPhase === "creating" || undefined}>
      {send.kind === "accepted" ? (
        <div className="rm-composer__result" ref={successRef} tabIndex={-1} data-testid="send-success">
          <Alert tone="info">
            <p>
              <strong>{t("resumatch.send.result.accepted", { to: send.to })}</strong>
            </p>
            <p>
              {send.status === "APPLIED" && props.application.status === "SAVED"
                ? t("resumatch.send.result.nowApplied")
                : t("resumatch.send.result.statusKept", { status: t(`resumatch.app.status.${send.status}`) })}{" "}
              {t("resumatch.send.result.notDelivery")}
            </p>
            {send.rejected.length > 0 ? (
              <p data-testid="send-not-delivered">{t("resumatch.send.result.notDeliveredTo", { addresses: send.rejected.join(", ") })}</p>
            ) : null}
            {!send.recorded ? <p>{t("resumatch.send.result.notRecorded")}</p> : null}
            <p>
              <a href={`/applications/sent/${encodeURIComponent(send.sentId)}`} data-testid="view-sent">
                {t("resumatch.send.result.view")}
              </a>{" "}
              · <a href="/applications">{t("resumatch.send.back")}</a>
            </p>
          </Alert>
        </div>
      ) : null}

      {props.unresolved && send.kind !== "accepted" ? (
        <Alert tone="warning">
          <p>
            {t("resumatch.send.unresolved")} (<LocalTime iso={props.unresolved.attemptedAt} />){" "}
            {t("resumatch.send.unresolvedHint")}{" "}
            <a href={`/applications/sent/${encodeURIComponent(props.unresolved.id)}`}>{t("resumatch.send.result.view")}</a>
          </p>
        </Alert>
      ) : null}

      {!props.sender.available ? <Alert tone="info">{t("resumatch.send.notConfigured")}</Alert> : null}

      <section className="rm-composer__sender" aria-labelledby={ids.sender}>
        <h2 id={ids.sender} className="rm-composer__heading">
          {t("resumatch.send.sender.heading")}
        </h2>
        <dl className="rm-composer__meta">
          <div>
            <dt>{t("resumatch.send.sender.company")}</dt>
            <dd>{props.application.employer ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("resumatch.send.sender.job")}</dt>
            <dd>{props.application.jobTitle ?? "—"}</dd>
          </div>
          <div>
            <dt>{t("resumatch.send.sender.from")}</dt>
            <dd data-testid="sender-from">{props.sender.from ?? t("resumatch.send.sender.fromUnset")}</dd>
          </div>
          <div>
            <dt>{t("resumatch.send.sender.replyTo")}</dt>
            <dd data-testid="sender-reply-to">{props.sender.replyTo ?? t("resumatch.send.sender.replyToUnset")}</dd>
          </div>
        </dl>
        <p className="rm-composer__note">{t("resumatch.send.sender.note")}</p>
      </section>

      <form
        className="rm-composer__form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void doSend();
        }}
      >
        <fieldset disabled={sending || send.kind === "accepted"} className="rm-composer__fieldset">
          <legend className="rm-composer__heading">{t("resumatch.send.message.heading")}</legend>

          {generating ? (
            <div className="rm-composer__busy" role="status" aria-live="polite" data-testid="draft-writing">
              <span className="rm-spinner" aria-hidden="true" />
              <span>
                <strong>
                  {generating === "subject"
                    ? t("resumatch.send.generate.busySubject")
                    : generating === "body"
                      ? t("resumatch.send.generate.busyBody")
                      : t("resumatch.send.generate.busyBoth")}
                </strong>{" "}
                <span className="rm-composer__busy-hint">{t("resumatch.send.generate.busyHint")}</span>
              </span>
            </div>
          ) : null}

          <div className="jm-field">
            <label htmlFor={ids.to}>
              <span>{t("resumatch.send.field.toEmail.label")}</span>
            </label>
            <input
              id={ids.to}
              type="email"
              inputMode="email"
              autoComplete="off"
              required
              maxLength={EMAIL_MAX_LENGTH}
              value={fields.toEmail}
              aria-invalid={problems.toEmail ? true : undefined}
              aria-describedby={`${ids.to}-hint${problems.toEmail ? ` ${ids.to}-error` : ""}`}
              onChange={(e) => update({ toEmail: e.target.value })}
            />
            <small id={`${ids.to}-hint`}>
              {props.prefill.toEmailSource === "job_posting" && fields.toEmail === props.prefill.toEmail
                ? t("resumatch.send.field.toEmail.fromPosting")
                : props.prefill.toEmailSource === "previous_email" && fields.toEmail === props.prefill.toEmail
                  ? t("resumatch.send.field.toEmail.fromPrevious")
                  : t("resumatch.send.field.toEmail.hint")}
            </small>
            {problems.toEmail ? (
              <p id={`${ids.to}-error`} className="rm-field-error">
                {problemText("toEmail")}
              </p>
            ) : null}
          </div>

          {fields.additionalToEmails.map((value, index) => {
            const id = `${ids.to}-extra-${index}`;
            const problem = extraProblems[index] ?? null;
            return (
              <div className="jm-field rm-composer__recipient" key={index} data-testid="extra-recipient">
                <label htmlFor={id}>
                  <span>{t("resumatch.send.field.additionalToEmails.label", { n: String(index + 2) })}</span>
                </label>
                <div className="rm-composer__recipient-row">
                  <input
                    id={id}
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    maxLength={EMAIL_MAX_LENGTH}
                    value={value}
                    aria-invalid={problem ? true : undefined}
                    aria-describedby={problem ? `${id}-error` : undefined}
                    onChange={(e) => setExtra(index, e.target.value)}
                  />
                  <Button type="button" variant="ghost" size="sm" onClick={() => removeExtra(index)} data-testid="remove-recipient">
                    <span aria-hidden="true">{t("resumatch.send.field.additionalToEmails.remove")}</span>
                    <span className="sr-only">
                      {t("resumatch.send.field.additionalToEmails.removeLabel", { address: value.trim() || String(index + 2) })}
                    </span>
                  </Button>
                </div>
                {problem ? (
                  <p id={`${id}-error`} className="rm-field-error">
                    {t(`resumatch.send.field.additionalToEmails.${problem}`)}
                  </p>
                ) : null}
              </div>
            );
          })}
          {problems.additionalToEmails && !extraProblems.some(Boolean) ? (
            <p className="rm-field-error">{problemText("additionalToEmails")}</p>
          ) : null}

          {1 + fields.additionalToEmails.length < MAX_RECIPIENTS || fields.additionalToEmails.length > 0 ? (
            <div className="rm-composer__recipients-more">
              {1 + fields.additionalToEmails.length < MAX_RECIPIENTS ? (
                <Button type="button" variant="ghost" size="sm" onClick={addExtra} data-testid="add-recipient">
                  {t("resumatch.send.field.additionalToEmails.add")}
                </Button>
              ) : null}
              {fields.additionalToEmails.length > 0 ? (
                <small className="rm-composer__note">{t("resumatch.send.field.additionalToEmails.hint")}</small>
              ) : null}
            </div>
          ) : null}

          {unusedSuggestions.length > 0 && suggestionSlot !== null ? (
            <p className="rm-composer__suggestions">
              {t("resumatch.send.field.toEmail.suggestions")}{" "}
              {unusedSuggestions.map((address) => (
                <button key={address} type="button" className="ui-btn ui-btn--ghost ui-btn--sm" onClick={() => pickSuggestion(address)}>
                  {address}
                </button>
              ))}
            </p>
          ) : null}

          <div className="jm-field">
            <label htmlFor={ids.name}>
              <span>{t("resumatch.send.field.contactName.label")}</span>
            </label>
            <input
              id={ids.name}
              type="text"
              autoComplete="off"
              maxLength={CONTACT_NAME_MAX_LENGTH}
              value={fields.contactName}
              aria-invalid={problems.contactName ? true : undefined}
              aria-describedby={problems.contactName ? `${ids.name}-error` : undefined}
              onChange={(e) => update({ contactName: e.target.value })}
            />
            {problems.contactName ? (
              <p id={`${ids.name}-error`} className="rm-field-error">
                {problemText("contactName")}
              </p>
            ) : null}
          </div>

          <div className="jm-field">
            <div className="rm-composer__label-row">
              <label htmlFor={ids.subject}>
                <span>{t("resumatch.send.field.subject.label")}</span>
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => void generate("subject")} disabled={busy} data-testid="regenerate-subject">
                {subjectWriting ? (
                  <span className="rm-composer__btn-busy">
                    <span className="rm-spinner" aria-hidden="true" />
                    {t("resumatch.send.generate.writing")}
                  </span>
                ) : (
                  t("resumatch.send.generate.subject")
                )}
              </Button>
            </div>
            <input
              id={ids.subject}
              type="text"
              required
              maxLength={SUBJECT_MAX_LENGTH}
              value={fields.subject}
              readOnly={subjectWriting}
              aria-busy={subjectWriting || undefined}
              data-writing={subjectWriting || undefined}
              placeholder={subjectWriting ? t("resumatch.send.generate.placeholder") : undefined}
              aria-invalid={problems.subject ? true : undefined}
              aria-describedby={problems.subject ? `${ids.subject}-error` : undefined}
              onChange={(e) => update({ subject: e.target.value, subjectEdited: true })}
            />
            {problems.subject ? (
              <p id={`${ids.subject}-error`} className="rm-field-error">
                {problemText("subject")}
              </p>
            ) : null}
          </div>

          <div className="jm-field">
            <div className="rm-composer__label-row">
              <label htmlFor={ids.body}>
                <span>{t("resumatch.send.field.body.label")}</span>
              </label>
              <Button type="button" variant="ghost" size="sm" onClick={() => void generate("body")} disabled={busy} data-testid="regenerate-body">
                {bodyWriting ? (
                  <span className="rm-composer__btn-busy">
                    <span className="rm-spinner" aria-hidden="true" />
                    {t("resumatch.send.generate.writing")}
                  </span>
                ) : (
                  t("resumatch.send.generate.body")
                )}
              </Button>
            </div>
            <textarea
              id={ids.body}
              rows={12}
              required
              maxLength={BODY_MAX_LENGTH}
              value={fields.body}
              readOnly={bodyWriting}
              aria-busy={bodyWriting || undefined}
              data-writing={bodyWriting || undefined}
              placeholder={bodyWriting ? t("resumatch.send.generate.placeholder") : undefined}
              aria-invalid={problems.body ? true : undefined}
              aria-describedby={`${ids.body}-hint${problems.body ? ` ${ids.body}-error` : ""}`}
              onChange={(e) => update({ body: e.target.value, bodyEdited: true })}
            />
            <small id={`${ids.body}-hint`}>{t("resumatch.send.field.body.hint")}</small>
            {problems.body ? (
              <p id={`${ids.body}-error`} className="rm-field-error">
                {problemText("body")}
              </p>
            ) : null}
          </div>

          <fieldset className="rm-composer__contact" data-testid="composer-contact">
            <legend className="rm-composer__subheading">{t("resumatch.contact.composer.title")}</legend>
            {(["DEFAULT", "OVERRIDE", "OMIT"] as const).map((mode) => (
              <label key={mode} className="rm-contact__radio">
                <input
                  type="radio"
                  name={`${ids.body}-contact`}
                  checked={contact.mode === mode}
                  disabled={busy}
                  onChange={() => changeContact(mode, mode === "OVERRIDE" ? (contact.override ?? props.contactDefaults ?? EMPTY_PREFERENCES) : contact.override)}
                />
                <span>
                  {mode === "DEFAULT"
                    ? t(props.contactDefaults ? "resumatch.contact.composer.default" : "resumatch.contact.composer.defaultNone")
                    : mode === "OVERRIDE"
                      ? t("resumatch.contact.composer.override")
                      : t("resumatch.contact.composer.omit")}
                </span>
              </label>
            ))}
            {contact.mode === "OVERRIDE" && contact.override ? (
              <ContactPreferencesFields
                value={contact.override}
                onChange={(next) => changeContact("OVERRIDE", next)}
                previewLanguage={props.emailLanguage}
                disabled={busy}
              />
            ) : null}
            <a className="rm-composer__contact-manage" href="/profile#contact-preferences">
              {t("resumatch.contact.composer.manage")}
            </a>
            {contactNote ? <Alert tone="info">{contactNote}</Alert> : null}
          </fieldset>

          {generateNote ? (
            <div className="rm-composer__note-block">
              <Alert tone={generateNote.tone}>{generateNote.text}</Alert>
            </div>
          ) : null}

          <section className="rm-composer__attachments" aria-label={t("resumatch.send.attachments.heading")}>
            <h3 className="rm-composer__subheading">{t("resumatch.send.attachments.heading")}</h3>
            {props.problems.includes("pins_invalid") ? <Alert tone="warning">{t("resumatch.send.attachments.pinsInvalid")}</Alert> : null}
            {!pins.cv || !pins.letter ? (
              <div className="rm-composer__pdfs-missing">
                <p>{t("resumatch.send.attachments.missing")}</p>
                {props.pdfRenderer ? (
                  pdfPhase === "creating" ? null : (
                    <Button type="button" variant="secondary" onClick={createPdfs} disabled={busy}>
                      {t("resumatch.send.entry.createPdfs")}
                    </Button>
                  )
                ) : (
                  <p className="rm-composer__note">{t("resumatch.send.attachments.noRenderer")}</p>
                )}
              </div>
            ) : (
              <ul className="rm-attachment-list">
                {(["cv", "letter"] as const).map((kind) => {
                  const pin = pins[kind]!;
                  return (
                    <li key={kind} className="rm-attachment" data-testid={`attachment-${kind}`}>
                      <span className="rm-attachment__icon" aria-hidden="true">
                        PDF
                      </span>
                      <span className="rm-attachment__main">
                        <span className="rm-attachment__name">{pin.filename}</span>
                        <span className="rm-attachment__meta">
                          {t(`resumatch.send.attachments.kind.${kind}`)} · {formatBytes(pin.byteSize)} · {t("resumatch.send.attachments.made")}{" "}
                          <LocalTime iso={pin.createdAt} />
                        </span>
                        {!pin.current ? (
                          <span className="rm-attachment__stale">
                            {t(`resumatch.send.attachments.stale.${kind}`)}{" "}
                            {pin.newerAvailable ? (
                              <button type="button" className="rm-linklike" onClick={() => pickNewer(kind)}>
                                {t("resumatch.send.attachments.useNewer")}
                              </button>
                            ) : props.pdfRenderer ? (
                              <button type="button" className="rm-linklike" onClick={createPdfs} disabled={pdfPhase === "creating"}>
                                {t("resumatch.send.attachments.makeNew")}
                              </button>
                            ) : null}
                          </span>
                        ) : null}
                      </span>
                      <span className="rm-attachment__actions">
                        <a href={`/api/pdfs/${encodeURIComponent(pin.id)}`} target="_blank" rel="noopener" className="ui-btn ui-btn--ghost ui-btn--sm">
                          {t("resumatch.send.attachments.preview")}
                          <span className="sr-only"> {pin.filename}</span>
                        </a>
                        <a href={`/api/pdfs/${encodeURIComponent(pin.id)}?download=1`} className="ui-btn ui-btn--ghost ui-btn--sm">
                          {t("resumatch.send.attachments.download")}
                          <span className="sr-only"> {pin.filename}</span>
                        </a>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div role="status" aria-live="polite" data-testid="pdfs-creating">
              {pdfPhase === "creating" ? (
                <div className="rm-composer__busy">
                  <span className="rm-spinner" aria-hidden="true" />
                  <span>
                    <strong>{t("resumatch.send.entry.creatingPdfs")}</strong>{" "}
                    <span className="rm-composer__busy-hint">{t("resumatch.send.attachments.creatingHint")}</span>
                  </span>
                </div>
              ) : null}
            </div>
            {pdfError ? (
              <Alert tone="error">
                <p>{pdfError.text}</p>
                {pdfError.code ? <p className="rm-composer__error-code">{t("resumatch.send.entry.pdfFailedCode", { code: pdfError.code })}</p> : null}
              </Alert>
            ) : null}
            {pins.cv && pins.letter ? <p className="rm-composer__note">{t("resumatch.send.attachments.note")}</p> : null}
          </section>

          <label className="rm-composer__checkbox" htmlFor={ids.copy}>
            <input
              id={ids.copy}
              type="checkbox"
              checked={fields.sendCopyToSelf}
              disabled={!props.sender.replyTo}
              onChange={(e) => update({ sendCopyToSelf: e.target.checked })}
            />
            <span>{props.sender.replyTo ? t("resumatch.send.copyToSelf", { email: props.sender.replyTo }) : t("resumatch.send.copyToSelfUnavailable")}</span>
          </label>
        </fieldset>

        <div ref={resultRef} tabIndex={-1} className="rm-composer__result">
          {send.kind === "failed" ? (
            <Alert tone="error">
              <p>
                <strong>{t("resumatch.send.result.failed")}</strong> {t(`resumatch.send.error.${errorGroup(send.code)}`)}
              </p>
              <p>{t("resumatch.send.result.failedKept")}</p>
            </Alert>
          ) : null}
          {send.kind === "uncertain" ? (
            <Alert tone="warning">
              <p>
                <strong>{t("resumatch.send.result.uncertain")}</strong> {t("resumatch.send.result.uncertainHint")}
              </p>
              <p>
                <a href={`/applications/sent/${encodeURIComponent(send.sentId)}`}>{t("resumatch.send.result.view")}</a>
              </p>
            </Alert>
          ) : null}
          {send.kind === "network" ? (
            <Alert tone="warning">
              <p>
                <strong>{t("resumatch.send.result.network")}</strong> {t("resumatch.send.result.networkHint")}
              </p>
              <Button type="button" variant="secondary" size="sm" onClick={() => void doSend({ reuseKey: send.key })}>
                {t("resumatch.send.result.checkAgain")}
              </Button>
            </Alert>
          ) : null}
          {send.kind === "in_progress" ? <Alert tone="info">{t("resumatch.send.result.inProgress")}</Alert> : null}
          {send.kind === "invalid" ? <Alert tone="error">{t(`resumatch.send.invalid.${INVALID_KEYS.has(send.reason) ? send.reason : "error"}`)}</Alert> : null}
        </div>

        <p className="rm-save-status" role="status" aria-live="polite" data-testid="composer-status">
          {sending
            ? t("resumatch.send.sending")
            : saveState.kind === "saving"
              ? t("resumatch.app.save.saving")
              : saveState.kind === "saved"
                ? t("resumatch.send.save.saved")
                : dirty && hasText && send.kind !== "accepted"
                  ? t("resumatch.app.save.unsaved")
                  : ""}
        </p>
        {saveState.kind === "error" ? <Alert tone="error">{saveState.text}</Alert> : null}
        {saveState.kind === "conflict" ? (
          <Alert tone="warning">
            <p>{t("resumatch.send.save.conflict")}</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void saveDraft()}>
              {t("resumatch.send.save.overwrite")}
            </Button>
          </Alert>
        ) : null}

        <div className="rm-composer__actions">
          <Button type="submit" disabled={sendLocked} data-testid="send-submit" aria-describedby={lockReason ? ids.lock : undefined}>
            {sending ? t("resumatch.send.sending") : t("resumatch.send.submit")}
          </Button>
          <Button type="button" variant="secondary" onClick={() => void saveDraft()} disabled={busy || send.kind === "accepted"} data-testid="save-draft">
            {t("resumatch.send.saveDraft")}
          </Button>
          <Button type="button" variant="ghost" onClick={leave} disabled={sending} data-testid="cancel">
            {send.kind === "accepted" ? t("resumatch.send.close") : t("resumatch.send.cancel")}
          </Button>
        </div>
        {lockReason ? (
          <p id={ids.lock} className="rm-composer__lock" data-testid="send-locked-reason">
            {lockReason}
          </p>
        ) : null}
        {props.sendCount > 0 && props.lastSent ? (
          <p className="rm-composer__note">
            {t("resumatch.send.history", { count: props.sendCount })}{" "}
            <a href={`/applications/sent?application=${encodeURIComponent(props.application.id)}`}>{t("resumatch.send.historyLink")}</a>
          </p>
        ) : null}
      </form>

      <ConfirmDialog
        open={confirmReplace !== null}
        title={
          confirmReplace?.contactOnly
            ? t("resumatch.contact.composer.replaceTitle")
            : confirmReplace?.part === "subject"
              ? t("resumatch.send.replace.subjectTitle")
              : t("resumatch.send.replace.bodyTitle")
        }
        message={confirmReplace?.contactOnly ? t("resumatch.contact.composer.replaceMessage") : t("resumatch.send.replace.message")}
        confirmLabel={confirmReplace?.contactOnly ? t("resumatch.contact.composer.replaceConfirm") : t("resumatch.send.replace.confirm")}
        cancelLabel={confirmReplace?.contactOnly ? t("resumatch.contact.composer.replaceCancel") : t("resumatch.send.replace.cancel")}
        onConfirm={() => {
          if (confirmReplace?.contactOnly) {
            // The candidate's other edits stay, so the body stays "edited".
            const { body, contactParagraph: next } = confirmReplace;
            setContactParagraph(next);
            setContactNote(null);
            setFields((current) => ({ ...current, body }));
          } else if (confirmReplace) {
            const { part, subject, body } = confirmReplace;
            if (part === "body") {
              setContactParagraph(confirmReplace.contactParagraph);
              setContactNote(null);
            }
            setFields((current) => ({
              ...current,
              ...(part === "subject" ? { subject, subjectEdited: false } : { body, bodyEdited: false }),
            }));
            setGenerateNote({ tone: "info", text: t("resumatch.send.generate.done") });
          }
          setConfirmReplace(null);
        }}
        onCancel={() => {
          if (confirmReplace?.contactOnly) setContactNote(t("resumatch.contact.composer.kept"));
          else setGenerateNote({ tone: "info", text: t("resumatch.send.replace.kept") });
          setConfirmReplace(null);
        }}
      />
      <ConfirmDialog
        open={confirmLeave}
        title={t("resumatch.send.leave.title")}
        message={t("resumatch.send.leave.message")}
        confirmLabel={t("resumatch.send.leave.confirm")}
        cancelLabel={t("resumatch.send.leave.cancel")}
        tone="danger"
        onConfirm={() => {
          setConfirmLeave(false);
          setSaved({ ...fields });
          router.push("/applications");
        }}
        onCancel={() => setConfirmLeave(false)}
      />
      <ConfirmDialog
        open={confirmResend}
        title={t("resumatch.send.resend.title")}
        message={t("resumatch.send.resend.message")}
        confirmLabel={t("resumatch.send.resend.confirm")}
        cancelLabel={t("resumatch.send.resend.cancel")}
        tone="danger"
        onConfirm={() => {
          setConfirmResend(false);
          void doSend({ confirmResend: true });
        }}
        onCancel={() => setConfirmResend(false)}
      />
    </div>
  );
}

const INVALID_KEYS = new Set([
  "not_found",
  "not_configured",
  "attachments",
  "attachment_unreadable",
  "draft_conflict",
  "unresolved_send",
  "rate_limited",
  "no_reply_address",
]);

/** Provider codes, grouped into what the candidate can do about them. */
function errorGroup(code: string): "recipient" | "unavailable" | "rejected" {
  if (/^SMTP_55[0-3]$|RECIPIENT_REJECTED|EENVELOPE/.test(code)) return "recipient";
  if (/^SMTP_4|ECONNECTION|EDNS|EAUTH|ETLS|ETIMEDOUT_CONN|CONN/.test(code)) return "unavailable";
  return "rejected";
}

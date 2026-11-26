import type { ApplicationStatusName } from "../constants";
import type { EventKindName, SubmissionChannelName } from "./contract";
import type { AttachmentKindName } from "./attachments";
import type { EmailPreview } from "./eml";

/**
 * What the timeline page and the application card are given
 * (application-timeline.md). Client-safe and framework-free.
 *
 * Two sources are merged without copying one into the other: timeline
 * entries (ApplicationEvent) and the emails sent from ResuMatch
 * (SentApplicationEmail, whose delivery records stay exactly as they are).
 * Oldest first; equal times keep the order they were recorded in.
 */

export interface AttachmentView {
  id: string;
  kind: AttachmentKindName;
  contentType: string;
  filename: string;
  byteSize: number;
  createdAt: string;
  /** Saved emails only: headers and plain text, shown as text. */
  emailPreview: EmailPreview | null;
}

export interface EventEntryView {
  type: "event";
  id: string;
  kind: EventKindName;
  origin: "MANUAL" | "EXTERNAL_SUBMISSION";
  occurredAt: string;
  timeZone: string;
  summary: string | null;
  sender: string | null;
  recipient: string | null;
  nextAction: string | null;
  /** `YYYY-MM-DD`, or null. */
  followUpDay: string | null;
  fromStatus: ApplicationStatusName | null;
  toStatus: ApplicationStatusName | null;
  createdAt: string;
  updatedAt: string;
  attachments: AttachmentView[];
  /** The recorded external submission: edited with "Edit recorded
   *  details", removed only by undoing the submission. */
  isRecordedSubmission: boolean;
}

export interface EmailEntryView {
  type: "email";
  id: string;
  /** SENDING | ACCEPTED | FAILED | UNCERTAIN, as recorded. */
  status: string;
  at: string;
  to: string;
  subject: string;
  statusTransition: string | null;
}

export type TimelineEntryView = EventEntryView | EmailEntryView;

export function entryTime(entry: TimelineEntryView): string {
  return entry.type === "event" ? entry.occurredAt : entry.at;
}

function tieBreak(entry: TimelineEntryView): string {
  return entry.type === "event" ? entry.createdAt : entry.at;
}

/** Oldest first. */
export function mergeTimeline(events: EventEntryView[], emails: EmailEntryView[]): TimelineEntryView[] {
  return [...events, ...emails].sort((a, b) => {
    const t = entryTime(a).localeCompare(entryTime(b));
    if (t !== 0) return t;
    const c = tieBreak(a).localeCompare(tieBreak(b));
    return c !== 0 ? c : a.id.localeCompare(b.id);
  });
}

export interface LatestActivity {
  kind: EventKindName | "EMAIL_SENT" | "EMAIL_NOT_SENT";
  at: string;
  timeZone: string | null;
}

/** The newest of an entry and a sent email, for the card. A failed email
 *  is shown as "Email not sent", never as sent. */
export function latestActivity(
  event: { kind: EventKindName; occurredAt: Date | string; timeZone: string } | null,
  email: { status: string; sentAt: Date | string | null; attemptedAt: Date | string } | null,
): LatestActivity | null {
  const iso = (d: Date | string) => new Date(d).toISOString();
  const fromEvent = event ? { kind: event.kind, at: iso(event.occurredAt), timeZone: event.timeZone } : null;
  const fromEmail = email
    ? {
        kind: email.status === "ACCEPTED" ? ("EMAIL_SENT" as const) : ("EMAIL_NOT_SENT" as const),
        at: iso(email.sentAt ?? email.attemptedAt),
        timeZone: null,
      }
    : null;
  if (!fromEvent) return fromEmail;
  if (!fromEmail) return fromEvent;
  return fromEmail.at > fromEvent.at ? fromEmail : fromEvent;
}

export interface SubmissionView {
  channel: SubmissionChannelName;
  channelLabel: string | null;
  applicationUrl: string | null;
  reference: string | null;
  recordedAt: string | null;
}

/** The submission line on the card: the channel's own name, or the
 *  candidate's name for "Other". */
export function channelDisplay(view: Pick<SubmissionView, "channel" | "channelLabel">, label: (channel: SubmissionChannelName) => string): string {
  if (view.channel === "OTHER" && view.channelLabel) return view.channelLabel;
  return label(view.channel);
}

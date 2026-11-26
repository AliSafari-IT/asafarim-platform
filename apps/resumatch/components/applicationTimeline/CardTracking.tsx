"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import type { SubmissionChannelName, EventKindName } from "../../lib/applications/timeline/contract";
import { channelDisplay, latestActivity } from "../../lib/applications/timeline/view";
import { ZonedTimeText } from "./ZonedTimeText";

export interface CardTrackingProps {
  applicationId: string;
  submission: {
    channel: SubmissionChannelName;
    channelLabel: string | null;
    applicationUrl: string | null;
    reference: string | null;
    appliedAt: string | null;
    appliedTimeZone: string | null;
  } | null;
  latestEvent: { kind: EventKindName; occurredAt: string; timeZone: string } | null;
  latestEmail: { status: string; sentAt: string | null; attemptedAt: string } | null;
  entryCount: number;
}

/** "Mark as applied externally", shown beside "Send by email". Opening it
 *  changes nothing; only saving the form records the application. */
export function MarkExternalLink({ applicationId, recorded }: { applicationId: string; recorded: boolean }) {
  const { t } = useTranslation();
  if (recorded) return null;
  return (
    <a className="ui-btn ui-btn--secondary ui-btn--sm" href={`/applications/${encodeURIComponent(applicationId)}/external`} data-testid="mark-external">
      {t("resumatch.tl.markExternal")}
    </a>
  );
}

/**
 * The card's tracking lines (application-timeline.md): how and when the
 * candidate applied elsewhere (never "Email sent"), the latest activity,
 * and the timeline actions. The full history stays on the timeline page.
 */
export function CardTracking({ applicationId, submission, latestEvent, latestEmail, entryCount }: CardTrackingProps) {
  const { t } = useTranslation();
  const base = `/applications/${encodeURIComponent(applicationId)}`;
  const latest = latestActivity(latestEvent, latestEmail);
  return (
    <div className="rm-app-tracking">
      {submission ? (
        <p className="rm-app-send__last" data-testid="external-submission">
          <span data-testid="external-channel">{t("resumatch.tl.card.appliedVia", { channel: channelDisplay(submission, (c) => t(`resumatch.tl.channel.${c}`)) })}</span>
          {submission.appliedAt ? (
            <>
              {" · "}
              <ZonedTimeText iso={submission.appliedAt} timeZone={submission.appliedTimeZone} testId="external-applied-time" />
            </>
          ) : null}
          {submission.reference ? <> · {t("resumatch.tl.card.reference", { reference: submission.reference })}</> : null}
          {submission.applicationUrl ? (
            <>
              {" · "}
              <a href={submission.applicationUrl} target="_blank" rel="noopener noreferrer" data-testid="open-application-url">
                {t("resumatch.tl.openApplication")}
              </a>
            </>
          ) : null}
          {" · "}
          <a href={`${base}/external`} data-testid="edit-external">
            {t("resumatch.tl.card.editDetails")}
          </a>
        </p>
      ) : null}
      <p className="rm-app-send__last" data-testid="latest-activity">
        {latest ? (
          <>
            {t("resumatch.tl.card.latest", { what: t(`resumatch.tl.latest.${latest.kind}`) })} <ZonedTimeText iso={latest.at} timeZone={latest.timeZone} />
            {" · "}
          </>
        ) : null}
        <a href={`${base}/timeline?add=1#add-update`} data-testid="card-add-update">
          {t("resumatch.tl.addUpdate")}
        </a>
        {" · "}
        <a href={`${base}/timeline`} data-testid="card-view-timeline">
          {entryCount > 0 ? t("resumatch.tl.card.viewTimelineCount", { count: entryCount }) : t("resumatch.tl.viewTimeline")}
        </a>
      </p>
    </div>
  );
}

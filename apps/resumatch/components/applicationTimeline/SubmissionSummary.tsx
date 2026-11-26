"use client";

import { useTranslation } from "@asafarim/shared-i18n";
import { formatFollowUpDay } from "../../lib/applications/followUp";
import type { TimelinePage } from "../../lib/applications/timeline/service";
import { channelDisplay } from "../../lib/applications/timeline/view";
import { ZonedTimeText } from "./ZonedTimeText";

/** Status, submission channel and dates, each kept apart: the status is
 *  where the hiring process is, the channel is how they applied. */
export function SubmissionSummary({ application }: { application: TimelinePage["application"] }) {
  const { t, locale } = useTranslation();
  const sub = application.submission;
  const editHref = `/applications/${encodeURIComponent(application.id)}/external`;
  return (
    <section className="rm-tl-summary" aria-label={t("resumatch.tl.summaryLabel")} data-testid="submission-summary">
      <dl className="rm-composer__meta">
        <div>
          <dt>{t("resumatch.tl.summary.status")}</dt>
          <dd data-testid="summary-status">{t(`resumatch.app.status.${application.status}`)}</dd>
        </div>
        <div>
          <dt>{t("resumatch.tl.summary.channel")}</dt>
          <dd data-testid="summary-channel">{sub ? channelDisplay(sub, (c) => t(`resumatch.tl.channel.${c}`)) : t("resumatch.tl.summary.noChannel")}</dd>
        </div>
        <div>
          <dt>{t("resumatch.tl.summary.appliedAt")}</dt>
          <dd data-testid="summary-applied-at">
            {application.appliedAt ? <ZonedTimeText iso={application.appliedAt} timeZone={application.appliedTimeZone} testId="summary-applied-time" /> : "—"}
          </dd>
        </div>
        {sub?.reference ? (
          <div>
            <dt>{t("resumatch.tl.summary.reference")}</dt>
            <dd data-testid="summary-reference">{sub.reference}</dd>
          </div>
        ) : null}
        <div>
          <dt>{t("resumatch.tl.summary.followUp")}</dt>
          <dd data-testid="summary-follow-up">{application.followUpDay ? formatFollowUpDay(application.followUpDay, locale) : "—"}</dd>
        </div>
        {sub?.recordedAt ? (
          <div>
            <dt>{t("resumatch.tl.summary.recordedAt")}</dt>
            <dd>
              <ZonedTimeText iso={sub.recordedAt} timeZone={null} />
            </dd>
          </div>
        ) : null}
      </dl>
      <p className="rm-tl__actions">
        {sub?.applicationUrl ? (
          <a href={sub.applicationUrl} target="_blank" rel="noopener noreferrer" data-testid="summary-open-url">
            {t("resumatch.tl.openApplication")}
          </a>
        ) : null}
        <a href={editHref} data-testid="summary-edit">
          {sub ? t("resumatch.tl.editRecorded") : t("resumatch.tl.markExternal")}
        </a>
      </p>
    </section>
  );
}

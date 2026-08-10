"use client";

/**
 * Invitations addressed to this tutor: briefs the platform matched them to,
 * each with a proposal already prepared. Distinct from `/tutor/requests`,
 * which is the open marketplace feed.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "@asafarim/shared-i18n";

type Invite = {
  quoteRequestId: string;
  expiresAt: string;
  invitedAt: string | null;
  whyYou: string[];
  brief: {
    subject: string;
    topic: string | null;
    educationalLevel: string;
    learningObjective: string | null;
    deadlineAt: string | null;
    deadlineKind: string | null;
    language: string;
    mode: string;
    locationCity: string | null;
    estimatedSessions: number | null;
    sessionMinutes: number | null;
  } | null;
};

export default function TutorInvitesPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/tutors/invites");
      if (res.ok) {
        const data = (await res.json()) as { items: Invite[] };
        setItems(data.items);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">
        {t("edumatch.invites.title")}
      </h1>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        {t("edumatch.invites.subtitle")}
      </p>

      {loading ? (
        <p className="mt-8 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.invites.loading")}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-8 text-sm text-[var(--color-text-muted)]">
          {t("edumatch.invites.empty")}
        </p>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((invite) => (
            <li
              key={invite.quoteRequestId}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-panel)] p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold text-[var(--color-text)]">
                    {invite.brief?.subject}
                    {invite.brief?.topic ? ` — ${invite.brief.topic}` : ""}
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
                    {invite.brief?.educationalLevel} ·{" "}
                    {invite.brief?.language.toUpperCase()} ·{" "}
                    {invite.brief?.mode}
                    {invite.brief?.locationCity
                      ? ` · ${invite.brief.locationCity}`
                      : ""}
                  </p>
                </div>
                <span className="shrink-0 text-xs text-[var(--color-text-muted)]">
                  {t("edumatch.invites.expires", {
                    date: invite.expiresAt.slice(0, 10),
                  })}
                </span>
              </div>

              {invite.brief?.learningObjective && (
                <p className="mt-2 text-sm text-[var(--color-text)]">
                  {invite.brief.learningObjective}
                </p>
              )}

              {invite.whyYou.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {invite.whyYou.map((reason) => (
                    <li
                      key={reason}
                      className="rounded-full border border-[var(--color-border)] px-2.5 py-1 text-xs text-[var(--color-text-muted)]"
                    >
                      {reason}
                    </li>
                  ))}
                </ul>
              )}

              <Link
                href={`/tutor/invites/${invite.quoteRequestId}`}
                className="mt-4 inline-block rounded-lg bg-[var(--color-primary)] px-5 py-2 text-sm font-medium text-white transition hover:opacity-90"
              >
                {t("edumatch.invites.openBtn")}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

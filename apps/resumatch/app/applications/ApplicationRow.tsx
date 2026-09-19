"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@asafarim/ui";
import type { listApplications } from "../../lib/applications/service";
import { APPLICATION_STATUSES } from "../../lib/applications/constants";

type ApplicationWithRelations = Awaited<ReturnType<typeof listApplications>>[number];

const STATUS_LABELS: Record<string, string> = {
  SAVED: "Saved",
  APPLIED: "Applied",
  INTERVIEWING: "Interviewing",
  OFFER: "Offer",
  REJECTED: "Rejected",
};

/** One row: status dropdown and notes, both PATCHing
 *  /api/applications/[id] on change/blur. Server data stays the source of
 *  truth — router.refresh() re-syncs after each save rather than trusting
 *  optimistic local state to stay correct. */
export function ApplicationRow({ application }: { application: ApplicationWithRelations }) {
  const router = useRouter();
  const [notes, setNotes] = useState(application.notes ?? "");
  const [saving, setSaving] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/applications/${application.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title={application.targetJob.title ?? application.targetJob.employer ?? "Untitled job"}>
      {application.targetJob.employer ? <p style={{ opacity: 0.75 }}>{application.targetJob.employer}</p> : null}

      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.5rem" }}>
        <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
          <span>Status</span>
          <select
            value={application.status}
            disabled={saving}
            onChange={(e) => patch({ status: e.target.value })}
          >
            {APPLICATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </label>

        {application.tailoredResume ? (
          <a href={`/tailor/${application.tailoredResume.id}/preview`} style={{ fontSize: "0.85rem" }}>
            View tailored resume
          </a>
        ) : null}
      </div>

      <label className="jm-field" style={{ marginTop: "0.5rem" }}>
        <span>Notes</span>
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => patch({ notes })}
          disabled={saving}
          style={{ width: "100%" }}
        />
      </label>
    </Card>
  );
}

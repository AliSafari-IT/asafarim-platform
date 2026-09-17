"use client";

import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Card } from "@asafarim/ui";
import { FeedbackForm } from "../components/FeedbackForm";

/**
 * The candidate's own tracker (JM-052).
 *
 * Every action here is a status transition or a note, both scoped server-side
 * to the caller's own workspace (see lib/tracking/service.ts) — this
 * component never sends or trusts anything that would let it read or change
 * another candidate's tracked jobs.
 */

interface TrackedItem {
  id: string;
  jobPostingId: string;
  status: "SAVED" | "REJECTED" | "APPLIED";
  notes: string | null;
  appliedAt: string | null;
  interviewAt: string | null;
  followUpAt: string | null;
  createdAt: string;
  jobPosting: {
    title: string;
    employer: string;
    canonicalUrl: string;
    locationRaw: string | null;
  };
}

const STATUS_LABEL: Record<TrackedItem["status"], string> = {
  SAVED: "Saved",
  REJECTED: "Not interested",
  APPLIED: "Applied",
};

export function MyJobsTracker() {
  const [items, setItems] = useState<TrackedItem[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/tracking");
      if (!response.ok) {
        setError(true);
        return;
      }
      const body = (await response.json()) as { items: TrackedItem[] };
      setItems(body.items);
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = useCallback(
    async (jobPostingId: string, status: TrackedItem["status"]) => {
      const response = await fetch("/api/tracking", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobPostingId, status }),
      });
      if (response.ok) void load();
    },
    [load],
  );

  const remove = useCallback(
    async (jobPostingId: string) => {
      const response = await fetch("/api/tracking", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobPostingId }),
      });
      if (response.ok) void load();
    },
    [load],
  );

  if (error) {
    return <Alert tone="error">Your tracked jobs could not be loaded. Try refreshing the page.</Alert>;
  }

  if (items === null) {
    return <p className="jm-mono">Loading…</p>;
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <a href="/api/export/my-jobs" className="ui-btn ui-btn--secondary ui-btn--sm">
          Download CSV
        </a>
      </div>

      {items.length === 0 ? (
        <Alert tone="info">
          Nothing tracked yet. Save a job from the <a href="/jobs">search page</a> to see it here.
        </Alert>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {items.map((item) => (
            <Card key={item.id}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h3 style={{ margin: 0 }}>{item.jobPosting.title}</h3>
                  <p className="jm-mono" style={{ margin: "0.2rem 0", opacity: 0.8 }}>
                    {item.jobPosting.employer}
                    {item.jobPosting.locationRaw ? ` · ${item.jobPosting.locationRaw}` : ""}
                  </p>
                </div>
                <Badge tone={item.status === "APPLIED" ? "success" : "neutral"}>
                  {STATUS_LABEL[item.status]}
                </Badge>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.6rem" }}>
                <a
                  href={item.jobPosting.canonicalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ui-btn ui-btn--secondary ui-btn--sm"
                >
                  Open source →
                </a>
                {item.status !== "APPLIED" ? (
                  <Button variant="secondary" size="sm" onClick={() => void setStatus(item.jobPostingId, "APPLIED")}>
                    Mark applied
                  </Button>
                ) : null}
                {item.status === "SAVED" ? (
                  <Button variant="secondary" size="sm" onClick={() => void setStatus(item.jobPostingId, "REJECTED")}>
                    Not interested
                  </Button>
                ) : null}
                {item.status === "REJECTED" ? (
                  <Button variant="secondary" size="sm" onClick={() => void setStatus(item.jobPostingId, "SAVED")}>
                    Save again
                  </Button>
                ) : null}
                <Button variant="secondary" size="sm" onClick={() => void remove(item.jobPostingId)}>
                  Remove
                </Button>
                {/* No eligibility reasons are known on this page (this list
                    isn't re-evaluated against the confirmed profile), so
                    the "wrongly excluded" option stays hidden here — see
                    FeedbackForm's own guard against offering it with
                    nothing to name. */}
                <FeedbackForm jobPostingId={item.jobPostingId} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

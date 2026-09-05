"use client";

import { useState } from "react";
import { Button } from "@asafarim/ui";

/**
 * Relevance feedback form (JM-059), shared between the search results page
 * and the My Jobs tracker so a candidate can report the same thing from
 * wherever they're looking at a posting.
 *
 * The reason list and its "eligibility reasons" sub-picker exist so
 * feedback carries the same reason-code discipline as the rest of the app:
 * a candidate never types a diagnosis in free text alone — free text is
 * additive context on top of a code that actually routes to profile,
 * source, or rule triage. See lib/feedback/contract.ts.
 */

const REASON_OPTIONS: { value: string; label: string }[] = [
  { value: "PROFILE_SKILL_MISSING", label: "My profile is missing a skill I have" },
  { value: "PROFILE_DATA_INCORRECT", label: "Something else on my profile is wrong" },
  { value: "SOURCE_POSTING_STALE", label: "This posting looks filled or withdrawn" },
  { value: "SOURCE_DETAILS_INCORRECT", label: "The details shown don't match the source" },
  { value: "RULE_WRONGLY_EXCLUDED", label: "I was wrongly excluded from this job" },
  { value: "RULE_WRONGLY_INCLUDED", label: "This should have been excluded for me" },
  { value: "NOT_RELEVANT", label: "Just not relevant to me" },
  { value: "OTHER", label: "Something else" },
];

export interface FeedbackFormProps {
  jobPostingId: string;
  /** The eligibility reason codes actually shown for this posting, if any —
   *  narrows the "wrongly excluded" sub-picker to reasons the candidate
   *  actually saw, rather than every code that exists in the system. */
  eligibilityReasonCodes?: string[];
  onSubmitted?: () => void;
}

export function FeedbackForm({ jobPostingId, eligibilityReasonCodes = [], onSubmitted }: FeedbackFormProps) {
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState(REASON_OPTIONS[0].value);
  const [relatedReason, setRelatedReason] = useState(eligibilityReasonCodes[0] ?? "");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "sent" | "error">("idle");

  if (!open) {
    return (
      <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
        Why not a fit?
      </Button>
    );
  }

  if (outcome === "sent") {
    return <p className="jm-mono" style={{ fontSize: "0.8rem", opacity: 0.75 }}>Thanks — your feedback was recorded.</p>;
  }

  const submit = async () => {
    setSubmitting(true);
    setOutcome("idle");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobPostingId,
          reasonCode,
          note: note.trim() ? note.trim() : null,
          relatedEligibilityReasonCode: reasonCode === "RULE_WRONGLY_EXCLUDED" ? relatedReason : null,
        }),
      });
      if (response.ok) {
        setOutcome("sent");
        onSubmitted?.();
      } else {
        setOutcome("error");
      }
    } catch {
      setOutcome("error");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="jm-field"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        border: "1px solid var(--ui-border, #ddd)",
        borderRadius: "0.5rem",
        padding: "0.75rem",
        marginTop: "0.5rem",
        width: "100%",
      }}
    >
      <label className="jm-field">
        <span>What's wrong?</span>
        <select value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
          {REASON_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {reasonCode === "RULE_WRONGLY_EXCLUDED" && eligibilityReasonCodes.length > 0 ? (
        <label className="jm-field">
          <span>Which reason was wrong?</span>
          <select value={relatedReason} onChange={(event) => setRelatedReason(event.target.value)}>
            {eligibilityReasonCodes.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <label className="jm-field">
        <span>Anything else? (optional)</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={2000}
          rows={2}
        />
      </label>

      {outcome === "error" ? (
        <p className="jm-mono" style={{ fontSize: "0.75rem", color: "var(--ui-danger, #b00020)" }}>
          Could not send that. Try again.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <Button size="sm" disabled={submitting} onClick={() => void submit()}>
          Send feedback
        </Button>
        <Button variant="secondary" size="sm" disabled={submitting} onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

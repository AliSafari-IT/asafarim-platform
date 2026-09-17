"use client";

import { useState } from "react";
import { Button } from "@asafarim/ui";
import type { MatchEvidence, MatchResult } from "../../lib/matching/contract";
import type { CandidateProfileContent } from "../../lib/profile/contract";
import { explainProfileField } from "../../lib/matching/explainProfileField";

/**
 * Evidence-linked match explanation panel (JM-048) — the candidate-facing
 * payoff of the whole M5 matching contract. Renders a `MatchResult`
 * exactly the way lib/matching/contract.ts's module doc comment requires:
 * a score never shown bare, every claim traced to a specific profile fact
 * and posting requirement, and a degraded result that cannot be mistaken
 * for a real evaluation.
 */

const ACTION_COPY: Record<MatchResult["recommendedAction"], string> = {
  strong_match: "This looks like a strong match — worth prioritising.",
  worth_applying: "This is worth applying to.",
  consider_with_caveats: "Worth considering, but weigh the gaps below first.",
  likely_not_a_fit: "This is probably not a fit right now.",
};

const DEGRADED_REASON_COPY: Record<string, string> = {
  low_confidence: "the evaluation could not be completed with enough evidence",
};

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.7) return "high confidence";
  if (confidence >= 0.4) return "moderate confidence";
  return "low confidence";
}

function degradedReason(): string {
  // buildDegradedMatchResult does not currently carry a distinguishing
  // reason code of its own (budget exhaustion and provider failure both
  // collapse to the same neutral shape — see contract.ts) so the copy is
  // deliberately generic rather than guessing at a cause the result
  // doesn't actually state.
  return DEGRADED_REASON_COPY.low_confidence;
}

interface EvidenceRowProps {
  evidence: MatchEvidence;
  profile: CandidateProfileContent | null;
  jobPostingId: string;
  profileVersionId: string | null;
}

function EvidenceRow({ evidence, profile, jobPostingId, profileVersionId }: EvidenceRowProps) {
  const [reporting, setReporting] = useState(false);
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  const resolvedFact = profile ? explainProfileField(evidence.profileField, profile) : evidence.profileField;

  const submitReport = async () => {
    setReportState("sending");
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jobPostingId,
          reasonCode: "INCORRECT_MATCH_EVIDENCE",
          relatedProfileVersionId: profileVersionId,
          relatedProfileField: evidence.profileField,
          relatedPostingRequirement: evidence.postingRequirement,
        }),
      });
      setReportState(response.ok ? "sent" : "error");
    } catch {
      setReportState("error");
    }
  };

  return (
    <li className="jm-evidence-row">
      <div className="jm-evidence-row__facts">
        <span className="jm-evidence-row__fact" title={evidence.profileField}>
          {resolvedFact}
        </span>
        <span className="jm-evidence-row__connector" aria-hidden="true">
          ↔
        </span>
        <span className="jm-evidence-row__requirement">{evidence.postingRequirement}</span>
      </div>
      <p className="jm-mono jm-evidence-row__note">{evidence.note}</p>

      {reportState === "sent" ? (
        <p className="jm-mono jm-evidence-row__report-status">Thanks — reported.</p>
      ) : reporting ? (
        <div className="jm-evidence-row__report-actions">
          <Button
            size="sm"
            variant="secondary"
            disabled={reportState === "sending"}
            onClick={() => void submitReport()}
          >
            Confirm report
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setReporting(false)}>
            Cancel
          </Button>
          {reportState === "error" ? (
            <span className="jm-mono jm-evidence-row__report-status jm-evidence-row__report-status--error">
              Could not send that. Try again.
            </span>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          className="jm-evidence-row__report-toggle"
          onClick={() => setReporting(true)}
          aria-label={`Report incorrect evidence for "${evidence.postingRequirement}"`}
        >
          Report incorrect evidence
        </button>
      )}
    </li>
  );
}

export interface MatchPanelProps {
  result: MatchResult;
  profile: CandidateProfileContent | null;
  jobPostingId: string;
  profileVersionId: string | null;
}

export function MatchPanel({ result, profile, jobPostingId, profileVersionId }: MatchPanelProps) {
  if (result.degraded) {
    return (
      <div className="jm-match-panel jm-match-panel--degraded" role="status">
        <p className="jm-match-panel__degraded-label">
          <span aria-hidden="true">⚠</span> Not evaluated — {degradedReason()}.
        </p>
        <p className="jm-mono" style={{ fontSize: "0.8rem", opacity: 0.75, margin: 0 }}>
          No score or explanation is available for this posting right now. This is not a
          judgement about the job — try again later.
        </p>
      </div>
    );
  }

  const scorePct = Math.round(result.suitabilityScore * 100);
  const confPct = Math.round(result.confidence * 100);

  return (
    <div className="jm-match-panel">
      <div
        className="jm-match-panel__score"
        role="img"
        aria-label={`Suitability score ${scorePct} percent, ${confidenceLabel(result.confidence)} (${confPct} percent confidence)`}
      >
        <div className="jm-match-panel__score-bar-track">
          <div className="jm-match-panel__score-bar-fill" style={{ width: `${scorePct}%` }} />
        </div>
        <span className="jm-mono jm-match-panel__score-text">
          {scorePct}% suitability · {confidenceLabel(result.confidence)} ({confPct}%)
        </span>
      </div>

      <p className="jm-match-panel__action">{ACTION_COPY[result.recommendedAction]}</p>

      <div className="jm-match-panel__skill-lists">
        {result.matchingSkills.length > 0 ? (
          <div className="jm-skill-list jm-skill-list--matching">
            <h4>
              <span aria-hidden="true">✓</span> Matching
            </h4>
            <ul>
              {result.matchingSkills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.missingSkills.length > 0 ? (
          <div className="jm-skill-list jm-skill-list--missing">
            <h4>
              <span aria-hidden="true">✕</span> Missing
            </h4>
            <ul>
              {result.missingSkills.map((skill) => (
                <li key={skill}>{skill}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {result.uncertainRequirements.length > 0 ? (
          <div className="jm-skill-list jm-skill-list--uncertain">
            <h4>
              <span aria-hidden="true">?</span> Uncertain
            </h4>
            <ul>
              {result.uncertainRequirements.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {result.explanation.length > 0 ? (
        <div className="jm-match-panel__explanation">
          <h4>Why</h4>
          <ul className="jm-evidence-list">
            {result.explanation.map((evidence, index) => (
              <EvidenceRow
                key={`${evidence.profileField}::${index}`}
                evidence={evidence}
                profile={profile}
                jobPostingId={jobPostingId}
                profileVersionId={profileVersionId}
              />
            ))}
          </ul>
        </div>
      ) : null}

      {(result.embeddingModelVersion || result.evaluationModelVersion) ? (
        <p className="jm-mono jm-match-panel__provenance">
          Evaluated with {result.evaluationModelVersion ?? "unknown model"} · prompt {result.promptVersion}
        </p>
      ) : null}
    </div>
  );
}

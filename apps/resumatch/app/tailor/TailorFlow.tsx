"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input } from "@asafarim/ui";

const MIN_PASTE_CHARS = 120;

/**
 * The tailoring flow: paste a URL (or text), review the AI's suggestions,
 * confirm what gets saved.
 *
 * Proposal-review, not one-shot (issue #429): `generate-preview` runs the
 * provider call and returns suggestions for review only — nothing is
 * persisted until the candidate explicitly accepts, edits, or declines
 * each piece and presses Confirm, which calls `generate-confirm`. Fetching
 * a job still costs nothing; the AI tailoring call itself now has its own
 * explicit review step before anything is written, the same "nothing is
 * used until you confirm it" posture as the rest of this app, extended one
 * step further than a single up-front button press.
 */
export interface TailorFlowProps {
  /** The workspace's currently confirmed profile version — tailoring
   *  always reads from it, there is nothing else to pick between (only one
   *  version can be confirmed at a time). */
  confirmedVersionId: string;
}

interface ReviewExperienceItem {
  title: string;
  employer: string | null;
  startedOn: string | null;
  endedOn: string | null;
  isCurrent: boolean;
  originalSummary: string | null;
  suggestedBullets: string[];
  accepted: boolean[];
}

interface ReviewState {
  targetJobId: string;
  promptVersion: string;
  modelVersion: string;
  degraded: boolean;
  headline: string;
  summary: string;
  originalSkillsOrder: string[];
  suggestedSkillsOrder: string[];
  keepOriginalSkillOrder: boolean;
  experience: ReviewExperienceItem[];
}

type FetchState =
  | { kind: "idle" }
  | { kind: "fetching" }
  | { kind: "fetched"; targetJobId: string; title: string | null; employer: string | null; snippet: string }
  | { kind: "fetch_failed"; reasonCode: string }
  | { kind: "loading_review"; targetJobId: string }
  | { kind: "reviewing"; review: ReviewState }
  | { kind: "confirming"; review: ReviewState }
  | { kind: "error"; message: string };

const FETCH_FAILURE_MESSAGES: Record<string, string> = {
  URL_NOT_ALLOWED: "That address is not a public web page ResuMatch can fetch.",
  REDIRECT_REFUSED: "That page redirects elsewhere, so it was not fetched.",
  RESPONSE_TOO_LARGE: "That page is too large to read.",
  TIMEOUT: "That page took too long to respond.",
  HTTP_ERROR: "That page could not be loaded.",
  NETWORK_ERROR: "That page could not be reached.",
  NO_READABLE_TEXT: "No readable job description was found on that page.",
};

export function TailorFlow({ confirmedVersionId }: TailorFlowProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [mode, setMode] = useState<"url" | "paste" | "email">("url");
  const [state, setState] = useState<FetchState>({ kind: "idle" });

  const fetchJob = useCallback(async () => {
    if (!url.trim()) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/fetch-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not fetch that URL." });
        return;
      }
      if (body.status === "FETCH_FAILED") {
        setState({ kind: "fetch_failed", reasonCode: body.reasonCode ?? "HTTP_ERROR" });
        return;
      }
      setState({
        kind: "fetched",
        targetJobId: body.id,
        title: body.title,
        employer: body.employer,
        snippet: body.snippet,
      });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }, [url]);

  const pasteJob = useCallback(async () => {
    if (pastedText.trim().length < MIN_PASTE_CHARS) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/paste-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: pastedText }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not use that text." });
        return;
      }
      setState({
        kind: "fetched",
        targetJobId: body.id,
        title: body.title,
        employer: body.employer,
        snippet: body.snippet,
      });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }, [pastedText]);

  const pasteEmail = useCallback(async () => {
    if (emailText.trim().length < MIN_PASTE_CHARS) return;
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/paste-email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: emailText, subject: emailSubject.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not use that email." });
        return;
      }
      setState({
        kind: "fetched",
        targetJobId: body.id,
        title: body.title,
        employer: body.employer,
        snippet: body.snippet,
      });
    } catch {
      setState({ kind: "error", message: "Could not reach the server." });
    }
  }, [emailText, emailSubject]);

  const startReview = useCallback(
    async (targetJobId: string) => {
      setState({ kind: "loading_review", targetJobId });
      try {
        const res = await fetch("/api/tailor/generate-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ profileVersionId: confirmedVersionId, targetJobId }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? "Could not tailor toward that job." });
          return;
        }

        const suggestions = body.suggestions as
          | { headline: string | null; summary: string | null; skillsOrder: string[]; experienceBullets: string[][] }
          | null;
        const profile = body.profile as {
          headline: string | null;
          summary: string | null;
          skills: string[];
          experience: {
            title: string;
            employer: string | null;
            startedOn: string | null;
            endedOn: string | null;
            isCurrent: boolean;
            summary: string | null;
          }[];
        };

        const review: ReviewState = {
          targetJobId,
          promptVersion: body.promptVersion,
          modelVersion: body.modelVersion,
          degraded: body.degraded,
          headline: suggestions?.headline ?? profile.headline ?? "",
          summary: suggestions?.summary ?? profile.summary ?? "",
          originalSkillsOrder: profile.skills,
          suggestedSkillsOrder: suggestions?.skillsOrder?.length ? suggestions.skillsOrder : profile.skills,
          keepOriginalSkillOrder: !suggestions?.skillsOrder?.length,
          experience: profile.experience.map((entry, index) => {
            const suggestedBullets = suggestions?.experienceBullets?.[index] ?? [];
            return {
              title: entry.title,
              employer: entry.employer,
              startedOn: entry.startedOn,
              endedOn: entry.endedOn,
              isCurrent: entry.isCurrent,
              originalSummary: entry.summary,
              suggestedBullets,
              accepted: suggestedBullets.map(() => true),
            };
          }),
        };

        setState({ kind: "reviewing", review });
      } catch {
        setState({ kind: "error", message: "Could not reach the server." });
      }
    },
    [confirmedVersionId],
  );

  const toggleBullet = useCallback((experienceIndex: number, bulletIndex: number) => {
    setState((previous) => {
      if (previous.kind !== "reviewing") return previous;
      const experience = previous.review.experience.map((entry, i) => {
        if (i !== experienceIndex) return entry;
        const accepted = entry.accepted.map((value, j) => (j === bulletIndex ? !value : value));
        return { ...entry, accepted };
      });
      return { kind: "reviewing", review: { ...previous.review, experience } };
    });
  }, []);

  const updateReview = useCallback(<K extends keyof ReviewState>(key: K, value: ReviewState[K]) => {
    setState((previous) => {
      if (previous.kind !== "reviewing") return previous;
      return { kind: "reviewing", review: { ...previous.review, [key]: value } };
    });
  }, []);

  const confirm = useCallback(
    async (review: ReviewState) => {
      setState({ kind: "confirming", review });
      try {
        const res = await fetch("/api/tailor/generate-confirm", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profileVersionId: confirmedVersionId,
            targetJobId: review.targetJobId,
            promptVersion: review.promptVersion,
            modelVersion: review.modelVersion,
            degraded: review.degraded,
            approved: review.degraded
              ? null
              : {
                  headline: review.headline.trim() || null,
                  summary: review.summary.trim() || null,
                  skillsOrder: review.keepOriginalSkillOrder ? [] : review.suggestedSkillsOrder,
                  experienceBullets: review.experience.map((entry) =>
                    entry.suggestedBullets.filter((_, i) => entry.accepted[i]),
                  ),
                },
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? "Could not save this tailored CV." });
          return;
        }
        router.push(`/tailor/${body.id}/preview`);
      } catch {
        setState({ kind: "error", message: "Could not reach the server." });
      }
    },
    [confirmedVersionId, router],
  );

  const busy = state.kind === "fetching" || state.kind === "loading_review" || state.kind === "confirming";

  return (
    <Card title="Tailor your CV to a job">
      <p style={{ opacity: 0.85 }}>
        Paste the URL of a job posting you want to apply to. ResuMatch reads the page, shows you
        what AI suggests changing, and only saves what you approve — reject or edit anything
        before it's kept.
      </p>

      <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
        <Button variant={mode === "url" ? undefined : "ghost"} size="sm" onClick={() => setMode("url")} disabled={busy}>
          Paste a URL
        </Button>
        <Button variant={mode === "paste" ? undefined : "ghost"} size="sm" onClick={() => setMode("paste")} disabled={busy}>
          Paste the description instead
        </Button>
        <Button variant={mode === "email" ? undefined : "ghost"} size="sm" onClick={() => setMode("email")} disabled={busy}>
          Paste a recruiter's email
        </Button>
      </div>

      {mode === "url" ? (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
          <Input
            type="url"
            placeholder="https://company.example/careers/senior-engineer"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
            style={{ flex: 1 }}
          />
          <Button onClick={fetchJob} disabled={!url.trim() || busy}>
            {state.kind === "fetching" ? "Fetching…" : "Fetch job"}
          </Button>
        </div>
      ) : mode === "paste" ? (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ opacity: 0.7, fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            For postings ResuMatch can't fetch — behind a login wall, expired, or a page that
            redirects — paste the job description text directly instead.
          </p>
          <textarea
            rows={8}
            placeholder="Paste the full job description here…"
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={pasteJob} disabled={pastedText.trim().length < MIN_PASTE_CHARS || busy}>
              {state.kind === "fetching" ? "Reading…" : "Use this text"}
            </Button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: "0.75rem" }}>
          <p style={{ opacity: 0.7, fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
            Got a recruiter's invitation by email? Paste the whole thing — greeting, signature,
            quoted thread and all. ResuMatch strips the noise and keeps the role description.
          </p>
          <Input
            type="text"
            placeholder="Subject line (optional, helps guess the job title)"
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            disabled={busy}
            style={{ marginBottom: "0.5rem" }}
          />
          <textarea
            rows={8}
            placeholder="Paste the full email here…"
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={pasteEmail} disabled={emailText.trim().length < MIN_PASTE_CHARS || busy}>
              {state.kind === "fetching" ? "Reading…" : "Use this email"}
            </Button>
          </div>
        </div>
      )}

      {state.kind === "fetch_failed" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="warning">{FETCH_FAILURE_MESSAGES[state.reasonCode] ?? "That page could not be read."}</Alert>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      {state.kind === "fetched" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card title={state.title ?? "Job found"}>
            {state.employer ? <p style={{ opacity: 0.8 }}>{state.employer}</p> : null}
            <p style={{ opacity: 0.7, fontSize: "0.9rem" }}>{state.snippet}…</p>
            <Button onClick={() => startReview(state.targetJobId)}>Tailor my CV to this job</Button>
          </Card>
        </div>
      ) : null}

      {state.kind === "loading_review" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="info">Asking AI to suggest changes for this job — this can take up to a minute…</Alert>
        </div>
      ) : null}

      {state.kind === "reviewing" || state.kind === "confirming" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card title="Review before saving">
            {state.review.degraded ? (
              <Alert tone="warning">
                AI tailoring isn't available right now (budget or provider issue). You can still save
                your confirmed profile as this tailored CV, unchanged.
              </Alert>
            ) : (
              <>
                <p style={{ opacity: 0.7, fontSize: "0.85rem" }}>
                  Nothing here is saved yet. Edit any text, uncheck a bullet you don't want, and
                  confirm when you're happy with it.
                </p>

                <label className="jm-field">
                  <span>Headline</span>
                  <input
                    type="text"
                    value={state.review.headline}
                    onChange={(e) => updateReview("headline", e.target.value)}
                    disabled={state.kind === "confirming"}
                  />
                </label>

                <label className="jm-field">
                  <span>Summary</span>
                  <textarea
                    rows={4}
                    value={state.review.summary}
                    onChange={(e) => updateReview("summary", e.target.value)}
                    disabled={state.kind === "confirming"}
                  />
                </label>

                {state.review.suggestedSkillsOrder.join() !== state.review.originalSkillsOrder.join() ? (
                  <label className="jm-field" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <input
                      type="checkbox"
                      checked={!state.review.keepOriginalSkillOrder}
                      onChange={(e) => updateReview("keepOriginalSkillOrder", !e.target.checked)}
                      disabled={state.kind === "confirming"}
                    />
                    <span>
                      Reorder my skills toward this job:{" "}
                      <span className="jm-mono" style={{ fontSize: "0.8rem", opacity: 0.75 }}>
                        {state.review.suggestedSkillsOrder.join(" · ")}
                      </span>
                    </span>
                  </label>
                ) : null}

                {state.review.experience.length > 0 ? (
                  <div className="jm-field">
                    <span>Experience bullets</span>
                    {state.review.experience.map((entry, entryIndex) => (
                      <div key={entryIndex} style={{ marginTop: "0.75rem" }}>
                        <strong>
                          {entry.title}
                          {entry.employer ? ` · ${entry.employer}` : ""}
                        </strong>
                        {entry.suggestedBullets.length > 0 ? (
                          <ul style={{ listStyle: "none", padding: 0, margin: "0.4rem 0 0" }}>
                            {entry.suggestedBullets.map((bullet, bulletIndex) => (
                              <li key={bulletIndex} style={{ display: "flex", gap: "0.5rem", marginBottom: "0.3rem" }}>
                                <input
                                  type="checkbox"
                                  checked={entry.accepted[bulletIndex]}
                                  onChange={() => toggleBullet(entryIndex, bulletIndex)}
                                  disabled={state.kind === "confirming"}
                                  style={{ marginTop: "0.2rem" }}
                                />
                                <span style={{ fontSize: "0.9rem" }}>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ opacity: 0.6, fontSize: "0.85rem", fontStyle: "italic", margin: "0.3rem 0 0" }}>
                            No AI suggestion for this role — kept as written.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginTop: "1rem" }}>
              <Button onClick={() => confirm(state.review)} disabled={state.kind === "confirming"}>
                {state.kind === "confirming" ? "Saving…" : "Confirm & save"}
              </Button>
              <Button variant="ghost" onClick={() => setState({ kind: "idle" })} disabled={state.kind === "confirming"}>
                Discard
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}

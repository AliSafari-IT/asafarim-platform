"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, Input } from "@asafarim/ui";
import { ManualJobForm, type ManualJobFormValues } from "./ManualJobForm";

const MIN_PASTE_CHARS = 120;

/**
 * The tailoring flow: point at a job (URL, pasted text, a pasted email, an
 * uploaded file, or typed-in-by-hand details), review the AI's
 * suggestions, confirm what gets saved.
 *
 * Proposal-review, not one-shot (issue #429): `generate-preview` runs the
 * provider call and returns suggestions for review only — nothing is
 * persisted until the candidate explicitly accepts, edits, or declines
 * each piece and presses Confirm, which calls `generate-confirm`. Getting
 * the job's text into a `TargetJob` row still costs nothing regardless of
 * intake path; the AI tailoring call itself is what has the explicit
 * review step, the same "nothing is used until you confirm it" posture as
 * the rest of this app, extended one step further than a single up-front
 * button press.
 *
 * Five intake modes, each posting to its own route but landing in the same
 * `{ kind: "fetched", targetJobId, ... }` state afterward (see #458 and its
 * sub-issues #459–#461 for why each one exists):
 * - "url" → /api/tailor/fetch-job (#426)
 * - "paste" → /api/tailor/paste-job (#426)
 * - "email" → /api/tailor/paste-email (#459)
 * - "upload" → /api/tailor/upload-job (#460)
 * - "manual" → /api/tailor/manual-job (#461)
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

interface ReviewCoverLetter {
  greeting: string;
  paragraphs: string[];
  signOff: string;
  degraded: boolean;
  promptVersion: string;
  modelVersion: string;
  /** Whether to persist this letter on confirm — declining it is a valid
   *  outcome independent of the CV (issue #454). */
  include: boolean;
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
  /** null when the candidate didn't opt into a cover letter on the fetched
   *  card, or the call degraded with nothing to review. */
  coverLetter: ReviewCoverLetter | null;
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

type Mode = "url" | "paste" | "email" | "upload" | "manual";

export function TailorFlow({ confirmedVersionId }: TailorFlowProps) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("url");
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [coverLetterTone, setCoverLetterTone] = useState<"formal" | "warm" | "confident">("formal");
  const [coverLetterLength, setCoverLetterLength] = useState<"short" | "standard" | "detailed">("standard");
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

  const uploadJob = useCallback(async () => {
    if (!uploadFile) return;
    setState({ kind: "fetching" });
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch("/api/tailor/upload-job", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not read that file." });
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
  }, [uploadFile]);

  const submitManualJob = useCallback(async (values: ManualJobFormValues) => {
    setState({ kind: "fetching" });
    try {
      const res = await fetch("/api/tailor/manual-job", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: values.title,
          employer: values.employer,
          location: values.location || undefined,
          workMode: values.workMode || undefined,
          employmentType: values.employmentType || undefined,
          salaryMin: values.salaryMin ? Number(values.salaryMin) : undefined,
          salaryMax: values.salaryMax ? Number(values.salaryMax) : undefined,
          salaryCurrency: values.salaryCurrency || undefined,
          applicationDeadline: values.applicationDeadline || undefined,
          responsibilities: values.responsibilities || undefined,
          requirements: values.requirements || undefined,
          preferredQualifications: values.preferredQualifications || undefined,
          benefits: values.benefits || undefined,
          contactName: values.contactName || undefined,
          source: values.source || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? "Could not save those details." });
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
  }, []);

  const startReview = useCallback(
    async (targetJobId: string) => {
      setState({ kind: "loading_review", targetJobId });
      try {
        const res = await fetch("/api/tailor/generate-preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            profileVersionId: confirmedVersionId,
            targetJobId,
            includeCoverLetter,
            coverLetterTone: includeCoverLetter ? coverLetterTone : undefined,
            coverLetterLength: includeCoverLetter ? coverLetterLength : undefined,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? "Could not tailor toward that job." });
          return;
        }

        const suggestions = body.suggestions as
          | { headline: string | null; summary: string | null; skillsOrder: string[]; experienceBullets: string[][] }
          | null;
        const coverLetterResult = body.coverLetter as
          | {
              suggestion: { greeting: string; paragraphs: string[]; signOff: string } | null;
              degraded: boolean;
              promptVersion: string;
              modelVersion: string;
            }
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
          coverLetter:
            coverLetterResult && coverLetterResult.suggestion
              ? {
                  greeting: coverLetterResult.suggestion.greeting,
                  paragraphs: coverLetterResult.suggestion.paragraphs,
                  signOff: coverLetterResult.suggestion.signOff,
                  degraded: coverLetterResult.degraded,
                  promptVersion: coverLetterResult.promptVersion,
                  modelVersion: coverLetterResult.modelVersion,
                  include: true,
                }
              : null,
        };

        setState({ kind: "reviewing", review });
      } catch {
        setState({ kind: "error", message: "Could not reach the server." });
      }
    },
    [confirmedVersionId, includeCoverLetter, coverLetterTone, coverLetterLength],
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

  const updateCoverLetter = useCallback(<K extends keyof ReviewCoverLetter>(key: K, value: ReviewCoverLetter[K]) => {
    setState((previous) => {
      if (previous.kind !== "reviewing" || !previous.review.coverLetter) return previous;
      return {
        kind: "reviewing",
        review: { ...previous.review, coverLetter: { ...previous.review.coverLetter, [key]: value } },
      };
    });
  }, []);

  const updateCoverLetterParagraph = useCallback((index: number, value: string) => {
    setState((previous) => {
      if (previous.kind !== "reviewing" || !previous.review.coverLetter) return previous;
      const paragraphs = previous.review.coverLetter.paragraphs.map((p, i) => (i === index ? value : p));
      return {
        kind: "reviewing",
        review: { ...previous.review, coverLetter: { ...previous.review.coverLetter, paragraphs } },
      };
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
            coverLetter:
              review.coverLetter && review.coverLetter.include && !review.coverLetter.degraded
                ? {
                    approved: {
                      greeting: review.coverLetter.greeting.trim(),
                      paragraphs: review.coverLetter.paragraphs.map((p) => p.trim()).filter(Boolean),
                      signOff: review.coverLetter.signOff.trim(),
                    },
                    degraded: review.coverLetter.degraded,
                    promptVersion: review.coverLetter.promptVersion,
                    modelVersion: review.coverLetter.modelVersion,
                  }
                : null,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? "Could not save this tailored CV." });
          return;
        }
        router.push(
          body.coverLetterId
            ? `/tailor/${body.id}/preview?coverLetterId=${body.coverLetterId}`
            : `/tailor/${body.id}/preview`,
        );
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
        Point ResuMatch at a job you want to apply to — a URL, pasted text, a recruiter's email, an
        uploaded file, or details you type in yourself. It shows you what AI suggests changing, and
        only saves what you approve — reject or edit anything before it's kept.
      </p>

      <div className="rm-mode-tabs">
        <Button variant={mode === "url" ? undefined : "ghost"} size="sm" onClick={() => setMode("url")} disabled={busy}>
          Paste a URL
        </Button>
        <Button variant={mode === "paste" ? undefined : "ghost"} size="sm" onClick={() => setMode("paste")} disabled={busy}>
          Paste the description instead
        </Button>
        <Button variant={mode === "email" ? undefined : "ghost"} size="sm" onClick={() => setMode("email")} disabled={busy}>
          Paste a recruiter's email
        </Button>
        <Button variant={mode === "upload" ? undefined : "ghost"} size="sm" onClick={() => setMode("upload")} disabled={busy}>
          Upload a file
        </Button>
        <Button variant={mode === "manual" ? undefined : "ghost"} size="sm" onClick={() => setMode("manual")} disabled={busy}>
          Type in the details myself
        </Button>
      </div>

      {mode === "url" ? (
        <div className="rm-intake-panel" style={{ display: "flex", gap: "0.5rem" }}>
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
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
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
      ) : mode === "email" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
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
      ) : mode === "upload" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
            Have the posting as a PDF or Word file — downloaded from a portal, or attached to an
            email? Upload it directly; ResuMatch reads the text out of it.
          </p>
          <input
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={uploadJob} disabled={!uploadFile || busy}>
              {state.kind === "fetching" ? "Reading…" : "Use this file"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="rm-intake-panel">
          <ManualJobForm busy={busy} onSubmit={submitManualJob} />
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
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", margin: "0.5rem 0" }}>
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
              />
              <span>Also draft a cover letter for this job</span>
            </label>
            {includeCoverLetter ? (
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "0 0 0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>Tone</span>
                  <select value={coverLetterTone} onChange={(e) => setCoverLetterTone(e.target.value as typeof coverLetterTone)}>
                    <option value="formal">Formal</option>
                    <option value="warm">Warm</option>
                    <option value="confident">Confident</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>Length</span>
                  <select value={coverLetterLength} onChange={(e) => setCoverLetterLength(e.target.value as typeof coverLetterLength)}>
                    <option value="short">Short</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </label>
              </div>
            ) : null}
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
        <div className="rm-review">
          <Card title="Review before saving">
            {state.review.degraded ? (
              <Alert tone="warning">
                AI tailoring isn't available right now (budget or provider issue). You can still save
                your confirmed profile as this tailored CV, unchanged.
              </Alert>
            ) : (
              <>
                <p className="rm-review__intro">
                  Nothing here is saved yet. Edit any text, uncheck a bullet you don't want, and
                  confirm when you're happy with it.
                </p>

                <div className="rm-review__section">
                  <span className="rm-review__section-label">Headline</span>
                  <input
                    type="text"
                    value={state.review.headline}
                    onChange={(e) => updateReview("headline", e.target.value)}
                    disabled={state.kind === "confirming"}
                  />
                </div>

                <div className="rm-review__section">
                  <span className="rm-review__section-label">Summary</span>
                  <textarea
                    rows={4}
                    value={state.review.summary}
                    onChange={(e) => updateReview("summary", e.target.value)}
                    disabled={state.kind === "confirming"}
                  />
                </div>

                {state.review.suggestedSkillsOrder.join() !== state.review.originalSkillsOrder.join() ? (
                  <div className="rm-review__section">
                    <label className="rm-skill-toggle">
                      <input
                        type="checkbox"
                        checked={!state.review.keepOriginalSkillOrder}
                        onChange={(e) => updateReview("keepOriginalSkillOrder", !e.target.checked)}
                        disabled={state.kind === "confirming"}
                      />
                      <span>
                        Reorder my skills toward this job
                        <span className="rm-skill-pills jm-mono">
                          {state.review.suggestedSkillsOrder.map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                        </span>
                      </span>
                    </label>
                  </div>
                ) : null}

                {state.review.experience.length > 0 ? (
                  <div className="rm-review__section">
                    <span className="rm-review__section-label">Experience bullets</span>
                    {state.review.experience.map((entry, entryIndex) => (
                      <div className="rm-entry" key={entryIndex}>
                        <div className="rm-entry__heading">
                          <strong>{entry.title}</strong>
                          {entry.employer ? <span className="rm-entry__sub"> · {entry.employer}</span> : null}
                        </div>
                        {entry.suggestedBullets.length > 0 ? (
                          <ul className="rm-bullet-list">
                            {entry.suggestedBullets.map((bullet, bulletIndex) => (
                              <li
                                key={bulletIndex}
                                className={`rm-bullet-item${entry.accepted[bulletIndex] ? "" : " rm-bullet-item--unaccepted"}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={entry.accepted[bulletIndex]}
                                  onChange={() => toggleBullet(entryIndex, bulletIndex)}
                                  disabled={state.kind === "confirming"}
                                />
                                <span>{bullet}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p style={{ opacity: 0.6, fontSize: "0.85rem", fontStyle: "italic", margin: "0.4rem 0 0" }}>
                            No AI suggestion for this role — kept as written.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}

            {state.review.coverLetter ? (
              <div className="rm-review__section">
                <label className="rm-skill-toggle">
                  <input
                    type="checkbox"
                    checked={state.review.coverLetter.include}
                    onChange={(e) => updateCoverLetter("include", e.target.checked)}
                    disabled={state.kind === "confirming"}
                  />
                  <span>Cover letter</span>
                </label>

                {state.review.coverLetter.degraded ? (
                  <Alert tone="warning">
                    A cover letter couldn't be drafted right now (budget or provider issue). The CV
                    above will still save.
                  </Alert>
                ) : state.review.coverLetter.include ? (
                  <div style={{ marginTop: "0.5rem" }}>
                    <label className="jm-field">
                      <span className="rm-review__section-label">Greeting</span>
                      <input
                        type="text"
                        value={state.review.coverLetter.greeting}
                        onChange={(e) => updateCoverLetter("greeting", e.target.value)}
                        disabled={state.kind === "confirming"}
                      />
                    </label>
                    {state.review.coverLetter.paragraphs.map((paragraph, index) => (
                      <label className="jm-field" key={index} style={{ display: "block", marginTop: "0.5rem" }}>
                        <span className="rm-review__section-label">Paragraph {index + 1}</span>
                        <textarea
                          rows={3}
                          value={paragraph}
                          onChange={(e) => updateCoverLetterParagraph(index, e.target.value)}
                          disabled={state.kind === "confirming"}
                          style={{ width: "100%" }}
                        />
                      </label>
                    ))}
                    <label className="jm-field" style={{ display: "block", marginTop: "0.5rem" }}>
                      <span className="rm-review__section-label">Sign-off</span>
                      <input
                        type="text"
                        value={state.review.coverLetter.signOff}
                        onChange={(e) => updateCoverLetter("signOff", e.target.value)}
                        disabled={state.kind === "confirming"}
                      />
                    </label>
                  </div>
                ) : (
                  <p style={{ opacity: 0.6, fontSize: "0.85rem", fontStyle: "italic", margin: "0.3rem 0 0" }}>
                    Declined — nothing will be saved for the letter.
                  </p>
                )}
              </div>
            ) : null}

            <div className="rm-review__actions">
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

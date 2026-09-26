"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import { Alert, Button, Card, Input } from "@asafarim/ui";
import { ManualJobForm, type ManualJobFormValues } from "./ManualJobForm";
import { computeCoverLetterQuality } from "../../lib/tailoring/coverLetterQuality";
import { CoverLetterQualityChecklist } from "../../components/tailoring/CoverLetterQualityChecklist";
import { TailoringLoader } from "../../components/tailoring/TailoringLoader";
import {
  LANGUAGE_LABELS,
  OUTPUT_LANGUAGES,
  isOutputLanguage,
  outputLanguageFromLocale,
  type OutputLanguage,
} from "../../lib/tailoring/language";

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
  /** #642: the language the letter was asked for, or null for none. */
  outputLanguage: OutputLanguage | null;
  /** Whether to persist this letter on confirm — declining it is a valid
   *  outcome independent of the CV (issue #454). */
  include: boolean;
}

interface ReviewState {
  targetJobId: string;
  /** generate-preview's own record of the call it made — sent back
   *  verbatim to generate-confirm, which reads provenance from that row
   *  rather than from anything else in this request (issue #525). */
  previewId: string;
  promptVersion: string;
  modelVersion: string;
  degraded: boolean;
  /** The candidate's own freeform steering text for this run (issue #431),
   *  echoed back from generate-preview so confirm() can re-send it for
   *  provenance without re-deriving it. */
  instructions: string | null;
  /** The language this preview's suggestions were written in (#641),
   *  as generate-preview recorded it; null when none was requested. */
  outputLanguage: OutputLanguage | null;
  headline: string;
  summary: string;
  originalSkillsOrder: string[];
  suggestedSkillsOrder: string[];
  keepOriginalSkillOrder: boolean;
  experience: ReviewExperienceItem[];
  /** null when the candidate didn't opt into a cover letter on the fetched
   *  card, or the call degraded with nothing to review. */
  coverLetter: ReviewCoverLetter | null;
  /** The confirmed profile's own name — used only to render the letter
   *  quality checklist's "signed with your name" check (issue #456), same
   *  as generate-confirm carries it into the persisted content in code. */
  profileFullName: string | null;
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

/** fetch-job reason codes with their own message
 *  (resumatch.flow.fetchFailed.<code>); anything else gets the generic one. */
const FETCH_FAILURE_CODES = new Set([
  "URL_NOT_ALLOWED",
  "REDIRECT_REFUSED",
  "RESPONSE_TOO_LARGE",
  "TIMEOUT",
  "BOT_BLOCKED",
  "HTTP_ERROR",
  "NETWORK_ERROR",
  "NO_READABLE_TEXT",
]);

type Mode = "url" | "paste" | "email" | "upload" | "manual";

/** Mirrors lib/tailoring/ai/prompts.ts's MAX_INSTRUCTIONS_CHARS — kept as a
 *  local constant rather than imported, so this Client Component never
 *  risks pulling in a server-side module (see #471's server-only leak). */
const INSTRUCTIONS_MAX_CHARS = 1000;

export function TailorFlow({ confirmedVersionId }: TailorFlowProps) {
  const router = useRouter();
  const { t, locale: pageLocale } = useTranslation();
  const [url, setUrl] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [emailText, setEmailText] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [mode, setMode] = useState<Mode>("url");
  const [instructions, setInstructions] = useState("");
  // #641: defaults to the page language from the language bar (#640);
  // the candidate can pick another for this run.
  const [cvLanguage, setCvLanguage] = useState<OutputLanguage>(() => outputLanguageFromLocale(pageLocale));
  const [includeCoverLetter, setIncludeCoverLetter] = useState(false);
  const [coverLetterTone, setCoverLetterTone] = useState<"formal" | "warm" | "confident">("formal");
  const [coverLetterLength, setCoverLetterLength] = useState<"short" | "standard" | "detailed">("standard");
  // #642: null means "same as the CV", so the letter keeps following the CV
  // language until the candidate picks a different one on purpose.
  const [coverLetterLanguage, setCoverLetterLanguage] = useState<OutputLanguage | null>(null);
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
        setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.fetchUrl") });
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
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [url, t]);

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
        setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.pasteText") });
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
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [pastedText, t]);

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
        setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.pasteEmail") });
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
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [emailText, emailSubject, t]);

  const uploadJob = useCallback(async () => {
    if (!uploadFile) return;
    setState({ kind: "fetching" });
    try {
      const form = new FormData();
      form.append("file", uploadFile);
      const res = await fetch("/api/tailor/upload-job", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok) {
        setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.upload") });
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
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [uploadFile, t]);

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
        setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.manual") });
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
      setState({ kind: "error", message: t("resumatch.flow.error.network") });
    }
  }, [t]);

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
            coverLetterOutputLanguage: includeCoverLetter ? (coverLetterLanguage ?? undefined) : undefined,
            instructions: instructions.trim() || undefined,
            outputLanguage: cvLanguage,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.tailor") });
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
              outputLanguage: string | null;
            }
          | null;
        const profile = body.profile as {
          fullName: string | null;
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
          previewId: body.previewId,
          promptVersion: body.promptVersion,
          modelVersion: body.modelVersion,
          degraded: body.degraded,
          instructions: typeof body.instructions === "string" ? body.instructions : null,
          outputLanguage: isOutputLanguage(body.outputLanguage) ? body.outputLanguage : null,
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
          // A degraded letter has no suggestion; it still gets an entry (with
          // include: false) so the review says so instead of staying silent.
          coverLetter: coverLetterResult
            ? {
                greeting: coverLetterResult.suggestion?.greeting ?? "",
                paragraphs: coverLetterResult.suggestion?.paragraphs ?? [],
                signOff: coverLetterResult.suggestion?.signOff ?? "",
                degraded: coverLetterResult.degraded || !coverLetterResult.suggestion,
                promptVersion: coverLetterResult.promptVersion,
                modelVersion: coverLetterResult.modelVersion,
                outputLanguage: isOutputLanguage(coverLetterResult.outputLanguage) ? coverLetterResult.outputLanguage : null,
                include: Boolean(coverLetterResult.suggestion) && !coverLetterResult.degraded,
              }
            : null,
          profileFullName: profile.fullName,
        };

        setState({ kind: "reviewing", review });
      } catch {
        setState({ kind: "error", message: t("resumatch.flow.error.network") });
      }
    },
    [confirmedVersionId, includeCoverLetter, coverLetterTone, coverLetterLength, coverLetterLanguage, instructions, cvLanguage, t],
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
            previewId: review.previewId,
            instructions: review.instructions,
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
                  }
                : null,
          }),
        });
        const body = await res.json();
        if (!res.ok) {
          setState({ kind: "error", message: body.error ?? t("resumatch.flow.error.save") });
          return;
        }
        router.push(
          body.coverLetterId
            ? `/tailor/${body.id}/preview?coverLetterId=${body.coverLetterId}`
            : `/tailor/${body.id}/preview`,
        );
      } catch {
        setState({ kind: "error", message: t("resumatch.flow.error.network") });
      }
    },
    [confirmedVersionId, router, t],
  );

  /** A language's name for use inside a sentence, in the UI language. */
  const languageName = (code: OutputLanguage) => t(`resumatch.lang.${code}`);

  const busy = state.kind === "fetching" || state.kind === "loading_review" || state.kind === "confirming";

  return (
    <Card title={t("resumatch.flow.cardTitle")}>
      <p style={{ color: "var(--muted)" }}>
        {t("resumatch.flow.intro")}
      </p>

      <div className="rm-mode-tabs">
        <Button variant={mode === "url" ? undefined : "ghost"} size="sm" onClick={() => setMode("url")} disabled={busy}>
          {t("resumatch.flow.mode.url")}
        </Button>
        <Button variant={mode === "paste" ? undefined : "ghost"} size="sm" onClick={() => setMode("paste")} disabled={busy}>
          {t("resumatch.flow.mode.paste")}
        </Button>
        <Button variant={mode === "email" ? undefined : "ghost"} size="sm" onClick={() => setMode("email")} disabled={busy}>
          {t("resumatch.flow.mode.email")}
        </Button>
        <Button variant={mode === "upload" ? undefined : "ghost"} size="sm" onClick={() => setMode("upload")} disabled={busy}>
          {t("resumatch.flow.mode.upload")}
        </Button>
        <Button variant={mode === "manual" ? undefined : "ghost"} size="sm" onClick={() => setMode("manual")} disabled={busy}>
          {t("resumatch.flow.mode.manual")}
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
            {state.kind === "fetching" ? t("resumatch.flow.fetching") : t("resumatch.flow.fetch")}
          </Button>
        </div>
      ) : mode === "paste" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
            {t("resumatch.flow.paste.hint")}
          </p>
          <textarea className="ui-input"
            rows={8}
            placeholder={t("resumatch.flow.paste.placeholder")}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={pasteJob} disabled={pastedText.trim().length < MIN_PASTE_CHARS || busy}>
              {state.kind === "fetching" ? t("resumatch.flow.reading") : t("resumatch.flow.paste.submit")}
            </Button>
          </div>
        </div>
      ) : mode === "email" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint">
            {t("resumatch.flow.email.hint")}
          </p>
          <Input
            type="text"
            placeholder={t("resumatch.flow.email.subject")}
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            disabled={busy}
            style={{ marginBottom: "0.5rem" }}
          />
          <textarea className="ui-input"
            rows={8}
            placeholder={t("resumatch.flow.email.placeholder")}
            value={emailText}
            onChange={(e) => setEmailText(e.target.value)}
            disabled={busy}
            style={{ width: "100%" }}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={pasteEmail} disabled={emailText.trim().length < MIN_PASTE_CHARS || busy}>
              {state.kind === "fetching" ? t("resumatch.flow.reading") : t("resumatch.flow.email.submit")}
            </Button>
          </div>
        </div>
      ) : mode === "upload" ? (
        <div className="rm-intake-panel">
          <p className="rm-intake-panel__hint" id="rm-upload-job-hint">
            {t("resumatch.flow.upload.hint")}
          </p>
          <input
            type="file"
            aria-label={t("resumatch.flow.upload.aria")}
            aria-describedby="rm-upload-job-hint"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            disabled={busy}
          />
          <div style={{ marginTop: "0.5rem" }}>
            <Button onClick={uploadJob} disabled={!uploadFile || busy}>
              {state.kind === "fetching" ? t("resumatch.flow.reading") : t("resumatch.flow.upload.submit")}
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
          <Alert tone="warning">{t(
              FETCH_FAILURE_CODES.has(state.reasonCode)
                ? `resumatch.flow.fetchFailed.${state.reasonCode}`
                : "resumatch.flow.fetchFailed.default",
            )}</Alert>
        </div>
      ) : null}

      {state.kind === "error" ? (
        <div style={{ marginTop: "1rem" }}>
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      {state.kind === "fetched" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card title={state.title ?? t("resumatch.flow.jobFound")}>
            {state.employer ? <p style={{ color: "var(--muted)" }}>{state.employer}</p> : null}
            <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>{state.snippet}…</p>
            <label className="jm-field" style={{ display: "block", margin: "0.5rem 0" }}>
              <span className="rm-review__section-label">{t("resumatch.flow.cvLanguage")}</span>
              <select
                className="ui-input ui-select"
                value={cvLanguage}
                onChange={(e) => setCvLanguage(e.target.value as OutputLanguage)}
                aria-describedby="rm-cv-language-help"
                style={{ maxWidth: "16rem" }}
              >
                {OUTPUT_LANGUAGES.map((code) => (
                  <option key={code} value={code}>
                    {LANGUAGE_LABELS[code]}
                  </option>
                ))}
              </select>
              <small id="rm-cv-language-help">
                {t("resumatch.flow.cvLanguageHelp")}
              </small>
            </label>
            <label className="jm-field" style={{ display: "block", margin: "0.5rem 0" }}>
              <span className="rm-review__section-label">{t("resumatch.flow.instructions.label")}</span>
              <textarea className="ui-input"
                rows={2}
                placeholder={t("resumatch.flow.instructions.placeholder")}
                value={instructions}
                maxLength={INSTRUCTIONS_MAX_CHARS}
                onChange={(e) => setInstructions(e.target.value)}
                style={{ width: "100%" }}
              />
              <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                {t("resumatch.flow.instructions.counter", { count: instructions.length, max: INSTRUCTIONS_MAX_CHARS })}
              </span>
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", margin: "0.5rem 0" }}>
              <input
                type="checkbox"
                checked={includeCoverLetter}
                onChange={(e) => setIncludeCoverLetter(e.target.checked)}
              />
              <span>{t("resumatch.flow.includeCoverLetter")}</span>
            </label>
            {includeCoverLetter ? (
              <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "0 0 0.75rem" }}>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.tone")}</span>
                  <select className="ui-input ui-select" value={coverLetterTone} onChange={(e) => setCoverLetterTone(e.target.value as typeof coverLetterTone)}>
                    <option value="formal">{t("resumatch.flow.tone.formal")}</option>
                    <option value="warm">{t("resumatch.flow.tone.warm")}</option>
                    <option value="confident">{t("resumatch.flow.tone.confident")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.length")}</span>
                  <select className="ui-input ui-select" value={coverLetterLength} onChange={(e) => setCoverLetterLength(e.target.value as typeof coverLetterLength)}>
                    <option value="short">{t("resumatch.flow.length.short")}</option>
                    <option value="standard">{t("resumatch.flow.length.standard")}</option>
                    <option value="detailed">{t("resumatch.flow.length.detailed")}</option>
                  </select>
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.82rem" }}>
                  <span>{t("resumatch.flow.language")}</span>
                  <select
                    className="ui-input ui-select"
                    value={coverLetterLanguage ?? ""}
                    onChange={(e) =>
                      setCoverLetterLanguage(isOutputLanguage(e.target.value) ? e.target.value : null)
                    }
                  >
                    <option value="">{t("resumatch.flow.sameAsCv", { language: LANGUAGE_LABELS[cvLanguage] })}</option>
                    {OUTPUT_LANGUAGES.map((code) => (
                      <option key={code} value={code}>
                        {LANGUAGE_LABELS[code]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
            <Button onClick={() => startReview(state.targetJobId)}>{t("resumatch.flow.startReview")}</Button>
          </Card>
        </div>
      ) : null}

      {state.kind === "loading_review" ? (
        <div style={{ marginTop: "1rem" }}>
          <Card>
            <TailoringLoader />
          </Card>
        </div>
      ) : null}

      {state.kind === "reviewing" || state.kind === "confirming" ? (
        <div className="rm-review">
          <Card title={t("resumatch.review.title")}>
            {state.review.degraded ? (
              <Alert tone="warning">
                {t("resumatch.review.degraded")}
                {state.review.outputLanguage ? ` ${t("resumatch.review.degradedLanguage")}` : ""}
              </Alert>
            ) : (
              <>
                <p className="rm-review__intro">
                  {t("resumatch.review.intro")}
                </p>
                {state.review.outputLanguage ? (
                  <p className="rx-lang-note">
                    <span className="rx-pill rx-pill--lang">{LANGUAGE_LABELS[state.review.outputLanguage]}</span>
                    {t("resumatch.review.langNote", { language: languageName(state.review.outputLanguage) })}
                  </p>
                ) : null}

                {state.review.instructions ? (
                  <p style={{ color: "var(--muted)", fontSize: "0.82rem", fontStyle: "italic" }}>
                    {t("resumatch.review.steering", { note: state.review.instructions })}
                  </p>
                ) : null}

                <div className="rm-review__section">
                  <span className="rm-review__section-label">{t("resumatch.review.headline")}</span>
                  <input
                    type="text"
                    value={state.review.headline}
                    onChange={(e) => updateReview("headline", e.target.value)}
                    disabled={state.kind === "confirming"}
                  />
                </div>

                <div className="rm-review__section">
                  <span className="rm-review__section-label">{t("resumatch.review.summary")}</span>
                  <textarea className="ui-input"
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
                        {t("resumatch.review.reorderSkills")}
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
                    <span className="rm-review__section-label">{t("resumatch.review.experience")}</span>
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
                          <p style={{ color: "var(--muted)", fontSize: "0.85rem", fontStyle: "italic", margin: "0.4rem 0 0" }}>
                            {t("resumatch.review.noSuggestion")}
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
                    disabled={state.kind === "confirming" || state.review.coverLetter.degraded}
                  />
                  <span>{t("resumatch.coverLetter")}</span>
                </label>

                {state.review.coverLetter.degraded ? (
                  <Alert tone="warning">
                    {t("resumatch.review.cl.degraded")}
                    {state.review.coverLetter.outputLanguage
                      ? ` ${t("resumatch.review.cl.degradedLanguage", {
                          language: languageName(state.review.coverLetter.outputLanguage),
                        })}`
                      : ""}{" "}
                    {t("resumatch.review.cl.cvStillSaves")}
                  </Alert>
                ) : state.review.coverLetter.include ? (
                  <div style={{ marginTop: "0.5rem" }} lang={state.review.coverLetter.outputLanguage ?? undefined}>
                    {state.review.coverLetter.outputLanguage ? (
                      <p className="rx-lang-note" lang={pageLocale}>
                        <span className="rx-pill rx-pill--lang">
                          {LANGUAGE_LABELS[state.review.coverLetter.outputLanguage]}
                        </span>
                        {t("resumatch.review.cl.langNote", {
                          language: languageName(state.review.coverLetter.outputLanguage),
                        })}
                      </p>
                    ) : null}
                    <label className="jm-field">
                      <span className="rm-review__section-label">{t("resumatch.review.cl.greeting")}</span>
                      <input
                        type="text"
                        value={state.review.coverLetter.greeting}
                        onChange={(e) => updateCoverLetter("greeting", e.target.value)}
                        disabled={state.kind === "confirming"}
                      />
                    </label>
                    {state.review.coverLetter.paragraphs.map((paragraph, index) => (
                      <label className="jm-field" key={index} style={{ display: "block", marginTop: "0.5rem" }}>
                        <span className="rm-review__section-label">{t("resumatch.review.cl.paragraph", { n: index + 1 })}</span>
                        <textarea className="ui-input"
                          rows={3}
                          value={paragraph}
                          onChange={(e) => updateCoverLetterParagraph(index, e.target.value)}
                          disabled={state.kind === "confirming"}
                          style={{ width: "100%" }}
                        />
                      </label>
                    ))}
                    <label className="jm-field" style={{ display: "block", marginTop: "0.5rem" }}>
                      <span className="rm-review__section-label">{t("resumatch.review.cl.signOff")}</span>
                      <input
                        type="text"
                        value={state.review.coverLetter.signOff}
                        onChange={(e) => updateCoverLetter("signOff", e.target.value)}
                        disabled={state.kind === "confirming"}
                      />
                    </label>
                    <div style={{ marginTop: "0.75rem" }}>
                      <CoverLetterQualityChecklist
                        quality={computeCoverLetterQuality(
                          {
                            contractVersion: "1.0.0",
                            greeting: state.review.coverLetter.greeting,
                            paragraphs: state.review.coverLetter.paragraphs,
                            signOff: state.review.coverLetter.signOff,
                            fullName: state.review.profileFullName,
                          },
                          coverLetterLength,
                          state.review.coverLetter.outputLanguage,
                        )}
                      />
                    </div>
                  </div>
                ) : (
                  <p style={{ color: "var(--muted)", fontSize: "0.85rem", fontStyle: "italic", margin: "0.3rem 0 0" }}>
                    {t("resumatch.review.cl.declined")}
                  </p>
                )}
              </div>
            ) : null}

            <div className="rm-review__actions">
              <Button onClick={() => confirm(state.review)} disabled={state.kind === "confirming"}>
                {state.kind === "confirming" ? t("resumatch.saving") : t("resumatch.review.confirm")}
              </Button>
              <Button variant="ghost" onClick={() => setState({ kind: "idle" })} disabled={state.kind === "confirming"}>
                {t("resumatch.review.discard")}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </Card>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "@asafarim/shared-i18n";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Alert, Badge, Button, Card, useEdgeAutoScroll } from "@asafarim/ui";
import { LOW_CONFIDENCE_THRESHOLD } from "../../lib/profile/contract";
import type {
  CandidateProfileContent,
  CertificationEntry,
  EducationEntry,
  ExperienceEntry,
  LanguageEntry,
  ProfileConfidence,
} from "../../lib/profile/contract";
import { AwardIcon, BriefcaseIcon, GlobeIcon, GraduationCapIcon, TrashIcon } from "./icons";
import { SortableEntityCard } from "./SortableEntityCard";
import type { SummaryTone } from "../../lib/profile/ai/provider";
import { categorizeSkill, groupSkillsByCategory, SKILL_CATEGORIES } from "../../lib/profile/skillCategories";
import { parseSkillsFreeText } from "../../lib/profile/parseSkillsText";

/**
 * Profile review and correction (JM-021).
 *
 * The screen is built around one idea: **the extractor is a typing aid, not
 * an authority.** So it never presents extracted data as settled. Fields
 * the extractor guessed at are marked, the source of every value is stated,
 * and nothing reaches matching until the candidate presses Confirm.
 *
 * Uncertainty is shown as "check this", not as a percentage. The confidence
 * numbers are a three-tier ranking of how much structure the extractor had
 * to work with, not calibrated probabilities, and rendering them as "45%
 * confident" would claim a precision that does not exist.
 */

/** A candidate typing how long a qualification took ("2016-2020") is a much
 *  more natural instinct than typing when it finished ("2020"), but
 *  `educationSchema.completedOn` only accepts a single year or year-month
 *  (see lib/profile/contract.ts's YEAR_MONTH) — a span fails validation and,
 *  until this normalizer, surfaced only as a generic "could not be saved"
 *  error with no indication of which field was wrong. Silently keeping the
 *  end year on blur turns the common case into something that just works. */
function normalizeCompletedOn(value: string): string {
  const span = /^\s*\d{4}\s*[-–—]\s*(\d{4})\s*$/.exec(value);
  return span ? span[1] : value;
}

export interface ProfileWorkbenchProps {
  initialContent: CandidateProfileContent;
  initialConfidence: ProfileConfidence;
  versionId: string | null;
  versionNumber: number | null;
  isConfirmed: boolean;
  hasDocument: boolean;
}

type SaveState = { kind: "idle" } | { kind: "saving" } | { kind: "error"; message: string } | { kind: "saved"; confirmed: boolean };

/** A safe-enough ISO-639-ish code for a manually-added language: the
 *  schema only requires 2-16 characters, and this field is never read for
 *  anything beyond display and de-duplication during extraction, so a
 *  slug of the label the candidate typed is sufficient. */
function codeFromLabel(label: string): string {
  const slug = label.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 16);
  return slug.length >= 2 ? slug : slug.padEnd(2, "x");
}

function removeAt<T>(list: T[], index: number): T[] {
  return list.filter((_, i) => i !== index);
}

/** Client-only identity for a reorderable card (experience/education), kept
 *  in a parallel array alongside the actual entries — see the `*Ids` state
 *  below. Never persisted; `crypto.randomUUID` isn't guaranteed in every
 *  browsing context (e.g. non-secure origins), hence the fallback. */
function randomId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random()}`;
}

function replaceAt<T>(list: T[], index: number, item: T): T[] {
  return list.map((existing, i) => (i === index ? item : existing));
}

function needsReview(confidence: ProfileConfidence, field: string): boolean {
  const score = confidence[field];
  return score !== undefined && score < LOW_CONFIDENCE_THRESHOLD;
}

function FieldLabel({ label, confidence, field }: { label: string; confidence: ProfileConfidence; field: string }) {
  const { t } = useTranslation();
  return (
    <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
      <span>{label}</span>
      {needsReview(confidence, field) ? (
        <Badge tone="warning">{t("resumatch.wb.checkThis")}</Badge>
      ) : confidence[field] !== undefined ? (
        <Badge tone="neutral">{t("resumatch.wb.fromCv")}</Badge>
      ) : null}
    </span>
  );
}

export function ProfileWorkbench({
  initialContent,
  initialConfidence,
  versionId,
  versionNumber,
  isConfirmed,
  hasDocument,
}: ProfileWorkbenchProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState<CandidateProfileContent>(initialContent);
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const navScroller = useEdgeAutoScroll<HTMLElement>();
  const [dirty, setDirty] = useState(false);
  // Skills and excluded-employers are free-typed lists, parsed into
  // structured data on every keystroke. The textarea's own text must be its
  // own state, not re-derived by rejoining the parsed array: typing a
  // trailing comma, newline, or run of whitespace to start the *next* entry
  // parses back to the *same* array as before that keystroke (an empty
  // trailing segment is dropped), so a value bound to the rejoined array
  // would snap back and silently eat exactly what was just typed —
  // rendering the field un-typable past the first couple of entries.
  const [skillsText, setSkillsText] = useState(() =>
    initialContent.skills.map((skill) => skill.name).join(", "),
  );
  const confidence = initialConfidence;
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();

  const [tone, setTone] = useState<SummaryTone>("friendly");
  const [rewriteState, setRewriteState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "preview"; text: string; degraded: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const [categorizeState, setCategorizeState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "preview"; suggestions: { name: string; category: string }[]; degraded: boolean }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  const update = useCallback(<K extends keyof CandidateProfileContent>(key: K, value: CandidateProfileContent[K]) => {
    setContent((previous) => ({ ...previous, [key]: value }));
    setDirty(true);
  }, []);

  // Reorderable cards (experience, education): each entry has no natural
  // unique id of its own (no `id` field on ExperienceEntry/EducationEntry),
  // and re-editing a field replaces that entry with a brand-new object every
  // keystroke — array index is the only thing that's stable while typing,
  // and unstable across a reorder. This client-only id, generated once per
  // entry and moved/added/removed in lockstep with the entry itself, is
  // what dnd-kit and React's own `key` both need to track a card's identity
  // through a drag rather than its current position.
  const [experienceIds, setExperienceIds] = useState<string[]>(() =>
    initialContent.experience.map(() => randomId()),
  );
  const [educationIds, setEducationIds] = useState<string[]>(() =>
    initialContent.education.map(() => randomId()),
  );

  // Shared by both reorderable lists: pointer drag (mouse/touch) plus a
  // keyboard sensor, so Space+Arrow keys reorder too — the Up/Down buttons
  // on each card cover the same case without needing focus inside the list,
  // but both being available (not one as a fallback for the other) matters.
  const reorderSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function moveExperience(from: number, to: number) {
    if (to < 0 || to >= content.experience.length) return;
    update("experience", arrayMove(content.experience, from, to));
    setExperienceIds((ids) => arrayMove(ids, from, to));
  }
  function removeExperience(index: number) {
    update("experience", removeAt(content.experience, index));
    setExperienceIds((ids) => removeAt(ids, index));
  }
  function handleExperienceDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = experienceIds.indexOf(active.id as string);
    const newIndex = experienceIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    moveExperience(oldIndex, newIndex);
  }

  function moveEducation(from: number, to: number) {
    if (to < 0 || to >= content.education.length) return;
    update("education", arrayMove(content.education, from, to));
    setEducationIds((ids) => arrayMove(ids, from, to));
  }
  function removeEducation(index: number) {
    update("education", removeAt(content.education, index));
    setEducationIds((ids) => removeAt(ids, index));
  }
  function handleEducationDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = educationIds.indexOf(active.id as string);
    const newIndex = educationIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;
    moveEducation(oldIndex, newIndex);
  }

  const requestRewrite = useCallback(async () => {
    const currentSummary = content.summary?.trim();
    if (!currentSummary) return;

    setRewriteState({ kind: "loading" });
    try {
      const response = await fetch("/api/profile/summary/rewrite", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentSummary, tone }),
      });
      const body = (await response.json()) as { rewritten?: string; degraded?: boolean; error?: string };
      if (!response.ok || !body.rewritten) {
        setRewriteState({ kind: "error", message: body.error ?? t("resumatch.wb.error.rewrite") });
        return;
      }
      // A candidate reviews and explicitly accepts or rejects this — it
      // never touches `content.summary` on its own, the same "nothing is
      // used until you confirm it" posture the rest of this form follows.
      setRewriteState({ kind: "preview", text: body.rewritten, degraded: body.degraded ?? false });
    } catch {
      setRewriteState({ kind: "error", message: t("resumatch.wb.error.rewriteNetwork") });
    }
  }, [content.summary, tone, t]);

  const requestCategorize = useCallback(async () => {
    const skillNames = content.skills.map((skill) => skill.name);
    if (skillNames.length === 0) return;

    setCategorizeState({ kind: "loading" });
    try {
      const response = await fetch("/api/profile/skills/categorize", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ skillNames }),
      });
      const body = (await response.json()) as {
        categories?: { name: string; category: string }[];
        degraded?: boolean;
        error?: string;
      };
      if (!response.ok || !body.categories) {
        setCategorizeState({ kind: "error", message: body.error ?? t("resumatch.wb.error.categorize") });
        return;
      }
      // A candidate reviews and explicitly applies this — it never touches
      // `content.skills` on its own, the same "nothing is used until you
      // confirm it" posture the rest of this form follows.
      setCategorizeState({ kind: "preview", suggestions: body.categories, degraded: body.degraded ?? false });
    } catch {
      setCategorizeState({
        kind: "error",
        message: t("resumatch.wb.error.categorizeNetwork"),
      });
    }
  }, [content.skills, t]);

  const applyCategorySuggestions = useCallback((suggestions: { name: string; category: string }[]) => {
    const byName = new Map(suggestions.map((s) => [s.name, s.category]));
    setContent((previous) => ({
      ...previous,
      skills: previous.skills.map((skill) =>
        byName.has(skill.name) ? { ...skill, category: byName.get(skill.name)! } : skill,
      ),
    }));
    setDirty(true);
    setCategorizeState({ kind: "idle" });
  }, []);

  const save = useCallback(
    async (confirm: boolean) => {
      setState({ kind: "saving" });
      try {
        // Rows added with "+ Add ..." and never filled in are dropped here
        // rather than sent — the schema requires a title/label, and a
        // candidate who added a row then changed their mind should not see
        // a validation error for leaving it empty.
        const submitted: CandidateProfileContent = {
          ...content,
          languages: content.languages.filter((language) => language.label.trim().length > 0),
          experience: content.experience.filter((role) => role.title.trim().length > 0),
          education: content.education.filter((entry) => entry.qualification.trim().length > 0),
          certifications: content.certifications.filter((entry) => entry.name.trim().length > 0),
        };
        const response = await fetch("/api/profile", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ content: submitted, parentVersionId: versionId, confirm }),
        });
        const body = (await response.json()) as { error?: string };
        if (!response.ok) {
          setState({ kind: "error", message: body.error ?? t("resumatch.wb.error.save") });
          return;
        }
        setDirty(false);
        setState({ kind: "saved", confirmed: confirm });
        // Pull the new version down so the next edit records the version
        // just written as its parent. Without this, a second save in the
        // same session posts the already-superseded parentVersionId and the
        // recorded lineage is wrong — which is the one thing immutable
        // versions exist to get right.
        router.refresh();
      } catch {
        setState({ kind: "error", message: t("resumatch.wb.error.saveNetwork") });
      }
    },
    [content, versionId, router, t],
  );

  const sectionLinks: { id: string; label: string; count?: number }[] = [
    { id: "about", label: t("resumatch.wb.nav.about") },
    { id: "experience", label: t("resumatch.wb.nav.experience"), count: content.experience.length },
    { id: "skills", label: t("resumatch.wb.nav.skills"), count: content.skills.length },
    { id: "education", label: t("resumatch.wb.nav.education"), count: content.education.length },
    { id: "certifications", label: t("resumatch.wb.nav.certifications"), count: content.certifications.length },
    { id: "languages", label: t("resumatch.wb.nav.languages"), count: content.languages.length },
    { id: "preferences", label: t("resumatch.wb.nav.preferences") },
  ];

  // One short, always-visible status in the sticky bar, so a save made from
  // the bar is acknowledged even when the page is scrolled far from the top.
  const status: { tone: "busy" | "dirty" | "ok" | "error" | "muted"; text: string } =
    state.kind === "saving"
      ? { tone: "busy", text: t("resumatch.saving") }
      : state.kind === "error"
        ? { tone: "error", text: t("resumatch.wb.status.notSaved") }
        : dirty
          ? { tone: "dirty", text: t("resumatch.wb.status.unsaved") }
          : state.kind === "saved"
            ? {
                tone: "ok",
                text: state.confirmed ? t("resumatch.wb.status.savedConfirmed") : t("resumatch.wb.status.draftSaved"),
              }
            : isConfirmed
              ? { tone: "ok", text: t("resumatch.journey.profile.confirmed") }
              : { tone: "muted", text: t("resumatch.journey.profile.pending") };

  return (
    <form
      ref={formRef}
      className="rm-wb"
      onSubmit={(event) => {
        event.preventDefault();
        void save(true);
      }}
    >
      {/* Sticky workbench bar: section jump links (with counts) and the save
          actions, so neither requires scrolling a long profile to reach. */}
      <div className="rm-wb__bar">
        <nav
          className="rm-wb__nav"
          aria-label={t("resumatch.wb.navAria")}
          ref={navScroller.ref}
          onMouseMove={navScroller.onMouseMove}
          onMouseLeave={navScroller.onMouseLeave}
        >
          {sectionLinks.map(({ id, label, count }) => (
            <a key={id} className="rm-wb__navlink" href={`#rm-sec-${id}`}>
              {label}
              {count !== undefined ? <span className="rm-wb__count">{count}</span> : null}
            </a>
          ))}
        </nav>
        <div className="rm-wb__actions">
          <span className={`rm-wb__status rm-wb__status--${status.tone}`} role="status" aria-live="polite">
            {status.text}
          </span>
          {versionNumber !== null ? <span className="jm-mono rm-wb__version">v{versionNumber}</span> : null}
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={state.kind === "saving"}
            onClick={() => void save(false)}
          >
            {t("resumatch.wb.saveDraft")}
          </Button>
          <Button type="submit" size="sm" disabled={state.kind === "saving"}>
            {state.kind === "saving" ? t("resumatch.saving") : t("resumatch.wb.saveConfirm")}
          </Button>
        </div>
      </div>

      {isConfirmed && !dirty ? (
        <Alert tone="info">
          <strong>{t("resumatch.wb.confirmed.strong")}</strong> {t("resumatch.wb.confirmed.body")}
        </Alert>
      ) : (
        <Alert tone="warning">
          <strong>{t("resumatch.wb.unconfirmed.strong")}</strong>{" "}
          {hasDocument ? t("resumatch.wb.unconfirmed.fromCv") : t("resumatch.wb.unconfirmed.byHand")}
        </Alert>
      )}

      {state.kind === "error" ? <Alert tone="error">{state.message}</Alert> : null}
      {state.kind === "saved" ? (
        <Alert tone="info">
          {state.confirmed ? t("resumatch.wb.saved.confirmed") : t("resumatch.wb.saved.draft")}
        </Alert>
      ) : null}

      <div className="rm-wb__layout">
        {/* Short "fact" sections: a narrow rail. Each column stacks on its
            own, so a tall card never stretches a short one beside it. */}
        <div className="rm-wb__rail">
          <div className="rm-wb__section rm-wb__section--about" id="rm-sec-about">
            <Card title={t("resumatch.wb.about.title")}>
              <label className="jm-field">
                <FieldLabel label={t("resumatch.wb.about.fullName")} confidence={confidence} field="fullName" />
                <input
                  type="text"
                  value={content.fullName ?? ""}
                  onChange={(event) => update("fullName", event.target.value || null)}
                  maxLength={160}
                />
              </label>

              <label className="jm-field">
                <FieldLabel label={t("resumatch.wb.about.email")} confidence={confidence} field="email" />
                <input
                  type="email"
                  value={content.email ?? ""}
                  onChange={(event) => update("email", event.target.value || null)}
                  maxLength={320}
                />
              </label>

              <label className="jm-field">
                <FieldLabel label={t("resumatch.wb.about.phone")} confidence={confidence} field="phone" />
                <input
                  type="tel"
                  value={content.phone ?? ""}
                  onChange={(event) => update("phone", event.target.value || null)}
                  maxLength={40}
                />
              </label>

              <label className="jm-field">
                <FieldLabel label={t("resumatch.wb.about.headline")} confidence={confidence} field="headline" />
                <input
                  type="text"
                  value={content.headline ?? ""}
                  onChange={(event) => update("headline", event.target.value || null)}
                  maxLength={200}
                  placeholder={t("resumatch.wb.about.headlinePlaceholder")}
                />
              </label>

              <label className="jm-field">
                <FieldLabel label={t("resumatch.wb.about.summary")} confidence={confidence} field="summary" />
                <textarea
                  rows={4}
                  value={content.summary ?? ""}
                  onChange={(event) => update("summary", event.target.value || null)}
                  maxLength={4000}
                  placeholder={t("resumatch.wb.about.summaryPlaceholder")}
                />
              </label>

              <div className="jm-rewrite">
                <div className="jm-rewrite__controls">
                  <select
                    aria-label={t("resumatch.wb.rewrite.toneAria")}
                    value={tone}
                    onChange={(event) => setTone(event.target.value as SummaryTone)}
                    disabled={rewriteState.kind === "loading"}
                  >
                    <option value="friendly">{t("resumatch.wb.rewrite.tone.friendly")}</option>
                    <option value="official">{t("resumatch.wb.rewrite.tone.official")}</option>
                    <option value="confident">{t("resumatch.wb.rewrite.tone.confident")}</option>
                    <option value="concise">{t("resumatch.wb.rewrite.tone.concise")}</option>
                  </select>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={rewriteState.kind === "loading" || !content.summary?.trim()}
                    onClick={() => void requestRewrite()}
                  >
                    {rewriteState.kind === "loading" ? t("resumatch.wb.rewrite.loading") : t("resumatch.wb.rewrite.suggest")}
                  </Button>
                </div>

                {rewriteState.kind === "error" ? (
                  <Alert tone="error">{rewriteState.message}</Alert>
                ) : null}

                {rewriteState.kind === "preview" ? (
                  <div className="jm-rewrite__preview">
                    {rewriteState.degraded ? (
                      <p className="jm-rewrite__note">
                        {t("resumatch.wb.rewrite.degraded")}
                      </p>
                    ) : null}
                    <p className="jm-rewrite__text">{rewriteState.text}</p>
                    <div className="jm-rewrite__actions">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => {
                          update("summary", rewriteState.text);
                          setRewriteState({ kind: "idle" });
                        }}
                      >
                        {t("resumatch.wb.rewrite.accept")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setRewriteState({ kind: "idle" })}>
                        {t("resumatch.wb.rewrite.reject")}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>

              <label className="jm-field">
                <span>{t("resumatch.wb.about.based")}</span>
                <input
                  type="text"
                  value={content.baseLocation ?? ""}
                  onChange={(event) => update("baseLocation", event.target.value || null)}
                  maxLength={120}
                  placeholder={t("resumatch.wb.about.basedPlaceholder")}
                />
              </label>

              <label className="jm-field">
                <span>{t("resumatch.wb.about.rightToWork")}</span>
                <select
                  value={content.workAuthorization ?? ""}
                  onChange={(event) =>
                    update(
                      "workAuthorization",
                      (event.target.value || null) as CandidateProfileContent["workAuthorization"],
                    )
                  }
                >
                  <option value="">{t("resumatch.wb.about.rtw.none")}</option>
                  <option value="eea_unrestricted">{t("resumatch.wb.about.rtw.eea")}</option>
                  <option value="national_permit">{t("resumatch.wb.about.rtw.permit")}</option>
                  <option value="requires_sponsorship">{t("resumatch.wb.about.rtw.sponsorship")}</option>
                </select>
                <small>{t("resumatch.wb.about.rtwHint")}</small>
              </label>
            </Card>
          </div>
          <div className="rm-wb__section rm-wb__section--languages" id="rm-sec-languages">
            <Card title={t("resumatch.wb.languages.title")}>
              <FieldLabel label={t("resumatch.wb.languages.title")} confidence={confidence} field="languages" />
              {content.languages.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>{t("resumatch.wb.languages.none")}</p>
              ) : (
                <ul className="jm-entity-list">
                  {content.languages.map((language, index) => (
                    <li key={index} className="jm-entity-card jm-entity-card--languages">
                      <span className="jm-entity-card__icon">
                        <GlobeIcon />
                      </span>
                      <span className="jm-entity-card__body">
                        <input
                          aria-label={t("resumatch.wb.languages.nameAria")}
                          type="text"
                          value={language.label}
                          placeholder={t("resumatch.wb.languages.placeholder")}
                          maxLength={64}
                          style={{ flex: "1 1 8rem", minWidth: 0, maxWidth: "100%" }}
                          onChange={(event) => {
                            const label = event.target.value;
                            update(
                              "languages",
                              replaceAt(content.languages, index, { ...language, label, code: codeFromLabel(label) }),
                            );
                          }}
                        />
                        <span className="jm-entity-card__actions">
                          <select
                            aria-label={t("resumatch.wb.languages.proficiencyAria", {
                              language: language.label || t("resumatch.wb.languages.placeholder"),
                            })}
                            value={language.proficiency ?? ""}
                            onChange={(event) => {
                              update(
                                "languages",
                                replaceAt(content.languages, index, {
                                  ...language,
                                  proficiency: (event.target.value || null) as (typeof language)["proficiency"],
                                }),
                              );
                            }}
                          >
                            <option value="">{t("resumatch.wb.languages.level.none")}</option>
                            <option value="basic">{t("resumatch.wb.languages.level.basic")}</option>
                            <option value="conversational">{t("resumatch.wb.languages.level.conversational")}</option>
                            <option value="professional">{t("resumatch.wb.languages.level.professional")}</option>
                            <option value="native">{t("resumatch.wb.languages.level.native")}</option>
                          </select>
                          <button
                            type="button"
                            aria-label={t("resumatch.wb.remove", { name: language.label || t("resumatch.wb.languages.fallback") })}
                            className="jm-icon-button"
                            onClick={() => update("languages", removeAt(content.languages, index))}
                          >
                            <TrashIcon />
                          </button>
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={content.languages.length >= 20}
                onClick={() => {
                  const blank: LanguageEntry = { code: "xx", label: "", proficiency: null };
                  update("languages", [...content.languages, blank]);
                }}
              >
                {t("resumatch.wb.languages.add")}
              </Button>
            </Card>
          </div>
          <div className="rm-wb__section rm-wb__section--preferences" id="rm-sec-preferences">
            <Card title={t("resumatch.wb.prefs.title")}>
              {/* ResuMatch used to be JobMatch, a job-board aggregation product
                  that actively searched postings and filtered them against
                  these preferences. That pipeline is gone — a candidate now
                  pastes one job URL and ResuMatch tailors toward it, nothing
                  is searched or filtered on their behalf. These fields are
                  kept (filling them in costs nothing, and they may feed a
                  future feature) but honestly labeled as reference-only, the
                  same way "Right to work" already is above, rather than
                  promising filtering that no longer happens. */}
              <label className="jm-field">
                <span>{t("resumatch.wb.prefs.arrangement")}</span>
                <select
                  value={content.preferences.remote ?? ""}
                  onChange={(event) =>
                    update("preferences", {
                      ...content.preferences,
                      remote: (event.target.value || null) as CandidateProfileContent["preferences"]["remote"],
                    })
                  }
                >
                  <option value="">{t("resumatch.wb.prefs.none")}</option>
                  <option value="onsite">{t("resumatch.wb.prefs.onsite")}</option>
                  <option value="hybrid">{t("resumatch.wb.prefs.hybrid")}</option>
                  <option value="remote">{t("resumatch.wb.prefs.remote")}</option>
                  <option value="any">{t("resumatch.wb.prefs.any")}</option>
                </select>
                <small>{t("resumatch.wb.prefs.arrangementHint")}</small>
              </label>

              <label className="jm-field">
                <span>{t("resumatch.wb.prefs.salary")}</span>
                <input
                  type="number"
                  min={0}
                  step={1000}
                  value={content.preferences.salaryFloor ?? ""}
                  onChange={(event) =>
                    update("preferences", {
                      ...content.preferences,
                      salaryFloor: event.target.value ? Number(event.target.value) : null,
                      salaryCurrency: content.preferences.salaryCurrency ?? "EUR",
                    })
                  }
                />
                <small>{t("resumatch.wb.prefs.salaryHint")}</small>
              </label>
            </Card>
          </div>
        </div>
        {/* Content-heavy sections: a wide canvas whose entry cards tile.
            Column count follows the canvas width (container queries). */}
        <div className="rm-wb__canvas">
          <div className="rm-wb__section rm-wb__section--experience" id="rm-sec-experience">
            <Card title={t("resumatch.wb.exp.title")}>
              <FieldLabel label={t("resumatch.wb.exp.label")} confidence={confidence} field="experience" />
              {content.experience.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>{t("resumatch.wb.exp.none")}</p>
              ) : (
                <DndContext
                  id="resumatch-experience-dnd"
                  sensors={reorderSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleExperienceDragEnd}
                >
                  <SortableContext items={experienceIds} strategy={verticalListSortingStrategy}>
                    <ul className="jm-entity-list">
                      {content.experience.map((role, index) => {
                        const setRole = (patch: Partial<ExperienceEntry>) =>
                          update("experience", replaceAt(content.experience, index, { ...role, ...patch }));
                        return (
                          <SortableEntityCard
                            key={experienceIds[index]}
                            id={experienceIds[index]!}
                            index={index}
                            count={content.experience.length}
                            icon={<BriefcaseIcon />}
                            title={t("resumatch.wb.exp.role", { n: index + 1 })}
                            variantClassName="jm-entity-card--experience"
                            onMoveUp={() => moveExperience(index, index - 1)}
                            onMoveDown={() => moveExperience(index, index + 1)}
                            onRemove={() => removeExperience(index)}
                            removeLabel={t("resumatch.wb.remove", { name: role.title || t("resumatch.wb.exp.fallback") })}
                          >
                            <div className="jm-entity-card__fields">
                              <label>
                                {t("resumatch.wb.exp.jobTitle")}
                                <input
                                  type="text"
                                  value={role.title}
                                  maxLength={120}
                                  placeholder={t("resumatch.wb.exp.jobTitlePlaceholder")}
                                  onChange={(event) => setRole({ title: event.target.value })}
                                />
                              </label>
                              <label>
                                {t("resumatch.wb.exp.employer")}
                                <input
                                  type="text"
                                  value={role.employer ?? ""}
                                  maxLength={120}
                                  placeholder={t("resumatch.wb.exp.employerPlaceholder")}
                                  onChange={(event) => setRole({ employer: event.target.value || null })}
                                />
                              </label>
                              <label>
                                {t("resumatch.wb.exp.started")}
                                <input
                                  type="text"
                                  value={role.startedOn ?? ""}
                                  placeholder="2021-03"
                                  onChange={(event) => setRole({ startedOn: event.target.value || null })}
                                />
                              </label>
                              <label>
                                {t("resumatch.wb.exp.ended")}
                                <input
                                  type="text"
                                  value={role.endedOn ?? ""}
                                  placeholder="2023-12"
                                  disabled={role.isCurrent}
                                  onChange={(event) => setRole({ endedOn: event.target.value || null })}
                                />
                              </label>
                            </div>
                            {!role.endedOn && (
                              <>
                                <label className="jm-entity-card__checkbox">
                                  <input
                                    type="checkbox"
                                    checked={role.isCurrent}
                                    onChange={(event) =>
                                      setRole({
                                        isCurrent: event.target.checked,
                                        endedOn: event.target.checked ? null : role.endedOn,
                                      })
                                    }
                                  />
                                  {t("resumatch.wb.exp.current")}
                                </label>
                                <small style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                                  {t("resumatch.wb.exp.datesHint")}
                                </small>
                              </>
                            )}
                            <div className="jm-entity-card__fields jm-entity-card__fields--full" style={{ marginTop: "0.6rem" }}>
                              <label>
                                {t("resumatch.wb.exp.highlights")}
                                <textarea
                                  rows={2}
                                  value={role.summary ?? ""}
                                  maxLength={2000}
                                  placeholder={t("resumatch.wb.exp.highlightsPlaceholder")}
                                  onChange={(event) => setRole({ summary: event.target.value || null })}
                                />
                              </label>
                            </div>
                          </SortableEntityCard>
                        );
                      })}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
              <div className="jm-add-row">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={content.experience.length >= 60}
                  onClick={() => {
                    const blank: ExperienceEntry = {
                      title: "",
                      employer: null,
                      startedOn: null,
                      endedOn: null,
                      isCurrent: false,
                      summary: null,
                    };
                    update("experience", [...content.experience, blank]);
                    setExperienceIds((ids) => [...ids, randomId()]);
                  }}
                >
                  {t("resumatch.wb.exp.add")}
                </Button>
              </div>
            </Card>
          </div>
          <div className="rm-wb__section rm-wb__section--skills" id="rm-sec-skills">
            <Card title={t("resumatch.wb.skills.title")}>
              <div className="rm-skills">
                <div className="rm-skills__input">
                  <label className="jm-field">
                    <FieldLabel label={t("resumatch.wb.skills.title")} confidence={confidence} field="skills" />
                    <textarea
                      rows={6}
                      value={skillsText}
                      onChange={(event) => {
                        const raw = event.target.value;
                        setSkillsText(raw);
                        // Shares its parser with CV-upload extraction
                        // (lib/profile/parseSkillsText.ts) so pasting a formatted
                        // skills block here — category headings, "Term:
                        // description" bullets, bullet glyphs and all — behaves the
                        // same as uploading the CV it came from, instead of storing
                        // every raw line verbatim.
                        //
                        // A skill already in `content.skills` keeps whatever
                        // category it has (including a candidate's manual
                        // override, which always wins); a newly-typed or
                        // newly-pasted one gets whatever category the parser just
                        // detected for it, if any. Matched by name,
                        // case-insensitively, since that's the only identity a
                        // free-typed list has.
                        const existingByName = new Map(
                          content.skills.map((skill) => [skill.name.toLowerCase(), skill]),
                        );
                        update(
                          "skills",
                          parseSkillsFreeText(raw).map(({ name, category }) => {
                            const existing = existingByName.get(name.toLowerCase());
                            return {
                              name,
                              rawLabel: name,
                              yearsExperience: existing?.yearsExperience ?? null,
                              category: existing?.category ?? category,
                            };
                          }),
                        );
                      }}
                    />
                    <small>
                      {t("resumatch.wb.skills.hint")}
                      {parseSkillsFreeText(skillsText).length > 200 ? ` ${t("resumatch.wb.skills.over200")}` : null}
                    </small>
                  </label>
                </div>
                <div className="rm-skills__groups">
                  {content.skills.length > 0 ? (
                    <div className="rm-skill-groups">
                      <p className="rm-skill-groups__hint">
                        {t("resumatch.wb.skills.groupsHint")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={categorizeState.kind === "loading"}
                        onClick={requestCategorize}
                      >
                        {categorizeState.kind === "loading" ? t("resumatch.wb.skills.asking") : t("resumatch.wb.skills.suggest")}
                      </Button>

                      {categorizeState.kind === "error" ? (
                        <Alert tone="error">{categorizeState.message}</Alert>
                      ) : null}

                      {categorizeState.kind === "preview" ? (
                        <div className="rm-skill-groups__suggestions">
                          {categorizeState.degraded ? (
                            <Alert tone="warning">
                              {t("resumatch.wb.skills.degraded")}
                            </Alert>
                          ) : (
                            <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
                              {t("resumatch.wb.skills.suggested")}
                            </p>
                          )}
                          <ul className="rm-skill-groups__suggestion-list">
                            {categorizeState.suggestions.map(({ name, category }) => (
                              <li key={name}>
                                <strong>{name}</strong> → {category}
                              </li>
                            ))}
                          </ul>
                          <div className="rm-review__actions">
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => applyCategorySuggestions(categorizeState.suggestions)}
                            >
                              {t("resumatch.wb.skills.applyAll")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => setCategorizeState({ kind: "idle" })}
                            >
                              {t("resumatch.wb.skills.dismiss")}
                            </Button>
                          </div>
                        </div>
                      ) : null}

                      <div className="rm-skill-groups__masonry">
                        {groupSkillsByCategory(
                          content.skills.map((skill) => skill.name),
                          (name) => content.skills.find((skill) => skill.name === name)?.category,
                        ).map(({ category, skills }) => (
                          <div className="rm-skill-group" key={category}>
                            <span className="rm-skill-group__label">{category}</span>
                            <div className="jm-chip-row">
                              {skills.map((name) => {
                                const index = content.skills.findIndex((skill) => skill.name === name);
                                const skill = content.skills[index];
                                return (
                                  <span className="jm-chip rm-skill-chip" key={`${name}-${index}`}>
                                    {name}
                                    {skill.yearsExperience ? ` · ${skill.yearsExperience}y` : ""}
                                    <select
                                      aria-label={t("resumatch.wb.skills.categoryAria", { name })}
                                      className="rm-skill-chip__category"
                                      value={category}
                                      onChange={(event) =>
                                        update(
                                          "skills",
                                          replaceAt(content.skills, index, {
                                            ...skill,
                                            category:
                                              event.target.value === categorizeSkill(name) ? null : event.target.value,
                                          }),
                                        )
                                      }
                                    >
                                      {SKILL_CATEGORIES.map((option) => (
                                        <option key={option} value={option}>
                                          {option}
                                        </option>
                                      ))}
                                    </select>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>
          <div className="rm-wb__section rm-wb__section--education" id="rm-sec-education">
            <Card title={t("resumatch.wb.edu.title")}>
              {content.education.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>{t("resumatch.wb.edu.none")}</p>
              ) : (
                <DndContext
                  id="resumatch-education-dnd"
                  sensors={reorderSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleEducationDragEnd}
                >
                  <SortableContext items={educationIds} strategy={verticalListSortingStrategy}>
                    <ul className="jm-entity-list">
                      {content.education.map((entry, index) => {
                        const setEntry = (patch: Partial<EducationEntry>) =>
                          update("education", replaceAt(content.education, index, { ...entry, ...patch }));
                        return (
                          <SortableEntityCard
                            key={educationIds[index]}
                            id={educationIds[index]!}
                            index={index}
                            count={content.education.length}
                            icon={<GraduationCapIcon />}
                            title={t("resumatch.wb.edu.item", { n: index + 1 })}
                            variantClassName="jm-entity-card--education"
                            onMoveUp={() => moveEducation(index, index - 1)}
                            onMoveDown={() => moveEducation(index, index + 1)}
                            onRemove={() => removeEducation(index)}
                            removeLabel={t("resumatch.wb.remove", { name: entry.qualification || t("resumatch.wb.edu.fallback") })}
                          >
                            <div className="jm-entity-card__fields">
                              <label>
                                {t("resumatch.wb.edu.qualification")}
                                <input
                                  type="text"
                                  value={entry.qualification}
                                  maxLength={160}
                                  placeholder={t("resumatch.wb.edu.qualificationPlaceholder")}
                                  onChange={(event) => setEntry({ qualification: event.target.value })}
                                />
                              </label>
                              <label>
                                {t("resumatch.wb.edu.institution")}
                                <input
                                  type="text"
                                  value={entry.institution ?? ""}
                                  maxLength={160}
                                  placeholder={t("resumatch.wb.edu.institutionPlaceholder")}
                                  onChange={(event) => setEntry({ institution: event.target.value || null })}
                                />
                              </label>
                              <label>
                                {t("resumatch.wb.edu.completed")}
                                <input
                                  type="text"
                                  value={entry.completedOn ?? ""}
                                  placeholder="2018"
                                  onChange={(event) => setEntry({ completedOn: event.target.value || null })}
                                  onBlur={(event) => {
                                    const normalized = normalizeCompletedOn(event.target.value);
                                    if (normalized !== event.target.value) setEntry({ completedOn: normalized || null });
                                  }}
                                />
                                <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                                  {t("resumatch.wb.edu.completedHint")}
                                </span>
                              </label>
                            </div>
                          </SortableEntityCard>
                        );
                      })}
                    </ul>
                  </SortableContext>
                </DndContext>
              )}
              <div className="jm-add-row">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={content.education.length >= 30}
                  onClick={() => {
                    const blank: EducationEntry = { qualification: "", institution: null, completedOn: null };
                    update("education", [...content.education, blank]);
                    setEducationIds((ids) => [...ids, randomId()]);
                  }}
                >
                  {t("resumatch.wb.edu.add")}
                </Button>
              </div>
            </Card>
          </div>
          <div className="rm-wb__section rm-wb__section--certifications" id="rm-sec-certifications">
            <Card title={t("resumatch.wb.cert.title")}>
              {content.certifications.length === 0 ? (
                <p style={{ color: "var(--muted)" }}>{t("resumatch.wb.cert.none")}</p>
              ) : (
                <ul className="jm-entity-list">
                  {content.certifications.map((entry, index) => {
                    const setEntry = (patch: Partial<CertificationEntry>) =>
                      update("certifications", replaceAt(content.certifications, index, { ...entry, ...patch }));
                    return (
                      <li key={index} className="jm-entity-card jm-entity-card--certifications jm-entity-card--stacked">
                        <div className="jm-entity-card__head">
                          <span className="jm-entity-card__icon">
                            <AwardIcon />
                          </span>
                          <strong style={{ flex: 1 }}>{t("resumatch.wb.cert.item", { n: index + 1 })}</strong>
                          <button
                            type="button"
                            aria-label={t("resumatch.wb.remove", { name: entry.name || t("resumatch.wb.cert.fallback") })}
                            className="jm-icon-button"
                            onClick={() => update("certifications", removeAt(content.certifications, index))}
                          >
                            <TrashIcon />
                          </button>
                        </div>
                        <div className="jm-entity-card__fields">
                          <label>
                            {t("resumatch.wb.cert.name")}
                            <input
                              type="text"
                              value={entry.name}
                              maxLength={160}
                              placeholder="AWS Certified Developer"
                              onChange={(event) => setEntry({ name: event.target.value })}
                            />
                          </label>
                          <label>
                            {t("resumatch.wb.cert.issuer")}
                            <input
                              type="text"
                              value={entry.issuer ?? ""}
                              maxLength={160}
                              placeholder="Amazon Web Services"
                              onChange={(event) => setEntry({ issuer: event.target.value || null })}
                            />
                          </label>
                          <label>
                            {t("resumatch.wb.cert.issued")}
                            <input
                              type="text"
                              value={entry.issuedOn ?? ""}
                              placeholder="2023-06"
                              onChange={(event) => setEntry({ issuedOn: event.target.value || null })}
                            />
                          </label>
                          <label>
                            {t("resumatch.wb.cert.expires")}
                            <input
                              type="text"
                              value={entry.expiresOn ?? ""}
                              placeholder="2026-06"
                              onChange={(event) => setEntry({ expiresOn: event.target.value || null })}
                            />
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div className="jm-add-row">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={content.certifications.length >= 40}
                  onClick={() => {
                    const blank: CertificationEntry = { name: "", issuer: null, issuedOn: null, expiresOn: null };
                    update("certifications", [...content.certifications, blank]);
                  }}
                >
                  {t("resumatch.wb.cert.add")}
                </Button>
              </div>
            </Card>
          </div>
        </div>
      </div>
    </form>
  );
}

import Link from "next/link";
import { getTranslator } from "../../lib/i18n-server";
import type { CandidateProfileContent } from "../../lib/profile/contract";
import { Ring } from "../components/app/Stats";

/**
 * Visual summaries for the profile page. Everything here is derived from
 * the latest saved profile version and its version list; nothing is
 * editable here — edits happen in ProfileWorkbench below. Async server
 * components, so each reads the UI language itself (getTranslator).
 */

type CheckKey = "nameEmail" | "headline" | "summary" | "experience" | "skills" | "education" | "languages";

interface Check {
  /** resumatch.insights.check.<key> is its label. */
  key: CheckKey;
  ok: boolean;
  /** The count shown beside the check, when it has one. */
  count?: number;
}

/** Seven things a tailorable profile needs. Deliberately simple and
 *  explainable — each one is a fact the candidate can see and fix. */
export function profileChecks(p: CandidateProfileContent): Check[] {
  return [
    { key: "nameEmail", ok: Boolean(p.fullName && p.email) },
    { key: "headline", ok: Boolean(p.headline) },
    { key: "summary", ok: Boolean(p.summary && p.summary.length >= 40) },
    { key: "experience", ok: p.experience.length > 0, count: p.experience.length },
    { key: "skills", ok: p.skills.length >= 3, count: p.skills.length },
    { key: "education", ok: p.education.length > 0, count: p.education.length },
    { key: "languages", ok: p.languages.length > 0, count: p.languages.length },
  ];
}

export async function ProfileCompleteness({ content }: { content: CandidateProfileContent }) {
  const { t } = await getTranslator();
  const checks = profileChecks(content);
  const done = checks.filter((c) => c.ok).length;
  const left = checks.length - done;
  const pct = Math.round((done / checks.length) * 100);
  const sections = [
    { label: t("resumatch.insights.check.experience"), count: content.experience.length },
    { label: t("resumatch.insights.check.skills"), count: content.skills.length },
    { label: t("resumatch.insights.check.education"), count: content.education.length },
    { label: t("resumatch.insights.check.certifications"), count: content.certifications.length },
    { label: t("resumatch.insights.check.languages"), count: content.languages.length },
  ];
  const maxCount = Math.max(1, ...sections.map((s) => s.count));

  return (
    <section className="rx-panel rx-complete" aria-labelledby="rx-complete-title">
      <div className="rx-complete__ring">
        <Ring value={done} max={checks.length} text={`${pct}%`} />
        <div>
          <h2 id="rx-complete-title" className="rx-panel__title">
            {t("resumatch.insights.strength")}
          </h2>
          <p className="rx-panel__sub">
            {left === 0
              ? t("resumatch.insights.allDone")
              : t(`resumatch.insights.left.${left === 1 ? "one" : "other"}`, { count: left })}
          </p>
        </div>
      </div>

      <ul className="rx-checks">
        {checks.map((c) => (
          <li key={c.key} className={c.ok ? "rx-check rx-check--ok" : "rx-check"}>
            <span className="rx-check__mark" aria-hidden="true">
              {c.ok ? "✓" : "○"}
            </span>
            <span>
              <span className="sr-only">{c.ok ? t("resumatch.journey.done") : t("resumatch.insights.missing")}</span>
              {t(`resumatch.insights.check.${c.key}`)}
            </span>
            {c.count !== undefined ? (
              <span className="rx-check__detail">
                {c.key === "experience"
                  ? t(`resumatch.insights.roles.${c.count === 1 ? "one" : "other"}`, { count: c.count })
                  : c.count}
              </span>
            ) : null}
          </li>
        ))}
      </ul>

      <ol className="rx-sections" aria-label={t("resumatch.insights.sectionsAria")}>
        {sections.map((s) => (
          <li key={s.label} className="rx-sections__row">
            <span className="rx-sections__label">{s.label}</span>
            <span className="rx-sections__track" aria-hidden="true">
              <span className="rx-sections__fill" style={{ width: `${(s.count / maxCount) * 100}%` }} />
            </span>
            <span className="rx-sections__count">{s.count}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** The post-confirmation next step, as a three-stop track. */
export async function NextStepTrack() {
  const { t } = await getTranslator();
  return (
    <section className="rx-panel rx-next" aria-labelledby="rx-next-title">
      <div className="rx-next__head">
        <h2 id="rx-next-title" className="rx-panel__title">
          {t("resumatch.insights.next.title")}
        </h2>
        <Link href="/tailor" className="rx-btn rx-btn--primary">
          {t("resumatch.insights.next.cta")}
        </Link>
      </div>
      <ol className="rx-steps">
        <li className="rx-steps__step rx-steps__step--done">
          <span className="rx-steps__node" aria-hidden="true">✓</span>
          <strong>{t("resumatch.insights.next.step1")}</strong>
          <span>{t("resumatch.insights.next.step1Body")}</span>
        </li>
        <li className="rx-steps__step rx-steps__step--next">
          <span className="rx-steps__node" aria-hidden="true">2</span>
          <strong>{t("resumatch.insights.next.step2")}</strong>
          <span>{t("resumatch.insights.next.step2Body")}</span>
        </li>
        <li className="rx-steps__step">
          <span className="rx-steps__node" aria-hidden="true">3</span>
          <strong>{t("resumatch.insights.next.step3")}</strong>
          <span>{t("resumatch.insights.next.step3Body")}</span>
        </li>
      </ol>
      <p className="rx-panel__note">{t("resumatch.insights.next.note")}</p>
    </section>
  );
}

export interface VersionItem {
  id: string;
  versionNumber: number;
  origin: string;
  isConfirmed: boolean;
  createdAt: Date;
  extractorName: string;
  extractorVersion: string;
}

/** Origins with their own label (resumatch.insights.origin.<ORIGIN>) and
 *  timeline tone; anything else counts as written by hand. */
const ORIGIN_TONE: Record<string, string> = {
  EXTRACTED: "extracted",
  CORRECTED: "corrected",
};

/** Every saved version, newest first, as a vertical timeline. */
export async function VersionTimeline({ versions }: { versions: VersionItem[] }) {
  const { t } = await getTranslator();
  const counts = versions.reduce<Record<string, number>>((acc, v) => {
    acc[v.origin] = (acc[v.origin] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <section className="rx-panel" aria-labelledby="rx-versions-title">
      <div className="rx-panel__head">
        <div>
          <h2 id="rx-versions-title" className="rx-panel__title">
            {t("resumatch.insights.versions.title")}
          </h2>
          <p className="rx-panel__sub">{t("resumatch.insights.versions.sub")}</p>
        </div>
        <ul className="rx-legend" aria-label={t("resumatch.insights.versions.legendAria")}>
          <li className="rx-legend__item rx-legend__item--extracted">
            {t("resumatch.insights.versions.legendExtracted", { count: counts.EXTRACTED ?? 0 })}
          </li>
          <li className="rx-legend__item rx-legend__item--corrected">
            {t("resumatch.insights.versions.legendCorrected", { count: counts.CORRECTED ?? 0 })}
          </li>
          <li className="rx-legend__item rx-legend__item--manual">
            {t("resumatch.insights.versions.legendManual", {
              count: versions.length - (counts.EXTRACTED ?? 0) - (counts.CORRECTED ?? 0),
            })}
          </li>
        </ul>
      </div>

      {/* Scrolls when the history is long, so it must be keyboard-focusable
          (arrow keys scroll it) and needs a name for that focus stop. */}
      <ol className="rx-vtl" tabIndex={0} aria-label={t("resumatch.insights.versions.listAria")}>
        {versions.map((v) => {
          const tone = ORIGIN_TONE[v.origin];
          const origin = tone
            ? { label: t(`resumatch.insights.origin.${v.origin}`), tone }
            : { label: t("resumatch.insights.origin.manual"), tone: "manual" };
          return (
            <li key={v.id} className={`rx-vtl__item rx-vtl__item--${origin.tone}${v.isConfirmed ? " rx-vtl__item--confirmed" : ""}`}>
              <span className="rx-vtl__dot" aria-hidden="true" />
              <div className="rx-vtl__body">
                <span className="rx-vtl__version">v{v.versionNumber}</span>
                <span className="rx-vtl__origin">{origin.label}</span>
                {v.isConfirmed ? <span className="rx-pill rx-pill--ok">{t("resumatch.journey.profile.confirmed")}</span> : null}
                <span className="rx-vtl__meta">
                  {v.createdAt.toISOString().slice(0, 10)} · {v.extractorName}@{v.extractorVersion}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

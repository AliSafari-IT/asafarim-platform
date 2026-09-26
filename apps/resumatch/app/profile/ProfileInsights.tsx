import Link from "next/link";
import type { CandidateProfileContent } from "../../lib/profile/contract";
import { Ring } from "../components/app/Stats";

/**
 * Visual summaries for the profile page. Everything here is derived from
 * the latest saved profile version and its version list; nothing is
 * editable here — edits happen in ProfileWorkbench below.
 */

interface Check {
  label: string;
  ok: boolean;
  /** Where the count comes from, shown beside the check. */
  detail?: string;
}

/** Seven things a tailorable profile needs. Deliberately simple and
 *  explainable — each one is a fact the candidate can see and fix. */
export function profileChecks(p: CandidateProfileContent): Check[] {
  return [
    { label: "Name and email", ok: Boolean(p.fullName && p.email) },
    { label: "Headline", ok: Boolean(p.headline) },
    { label: "Summary", ok: Boolean(p.summary && p.summary.length >= 40) },
    { label: "Experience", ok: p.experience.length > 0, detail: `${p.experience.length} role${p.experience.length === 1 ? "" : "s"}` },
    { label: "Skills", ok: p.skills.length >= 3, detail: `${p.skills.length}` },
    { label: "Education", ok: p.education.length > 0, detail: `${p.education.length}` },
    { label: "Languages", ok: p.languages.length > 0, detail: `${p.languages.length}` },
  ];
}

export function ProfileCompleteness({ content }: { content: CandidateProfileContent }) {
  const checks = profileChecks(content);
  const done = checks.filter((c) => c.ok).length;
  const pct = Math.round((done / checks.length) * 100);
  const sections = [
    { label: "Experience", count: content.experience.length },
    { label: "Skills", count: content.skills.length },
    { label: "Education", count: content.education.length },
    { label: "Certifications", count: content.certifications.length },
    { label: "Languages", count: content.languages.length },
  ];
  const maxCount = Math.max(1, ...sections.map((s) => s.count));

  return (
    <section className="rx-panel rx-complete" aria-labelledby="rx-complete-title">
      <div className="rx-complete__ring">
        <Ring value={done} max={checks.length} text={`${pct}%`} />
        <div>
          <h2 id="rx-complete-title" className="rx-panel__title">
            Profile strength
          </h2>
          <p className="rx-panel__sub">
            {done === checks.length
              ? "Everything a tailored CV draws on is filled in."
              : `${checks.length - done} thing${checks.length - done === 1 ? "" : "s"} left that tailoring can use.`}
          </p>
        </div>
      </div>

      <ul className="rx-checks">
        {checks.map((c) => (
          <li key={c.label} className={c.ok ? "rx-check rx-check--ok" : "rx-check"}>
            <span className="rx-check__mark" aria-hidden="true">
              {c.ok ? "✓" : "○"}
            </span>
            <span>
              <span className="sr-only">{c.ok ? "Done: " : "Missing: "}</span>
              {c.label}
            </span>
            {c.detail ? <span className="rx-check__detail">{c.detail}</span> : null}
          </li>
        ))}
      </ul>

      <ol className="rx-sections" aria-label="Items per section">
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
export function NextStepTrack() {
  return (
    <section className="rx-panel rx-next" aria-labelledby="rx-next-title">
      <div className="rx-next__head">
        <h2 id="rx-next-title" className="rx-panel__title">
          Your profile is confirmed — here’s what’s next
        </h2>
        <Link href="/tailor" className="rx-btn rx-btn--primary">
          Tailor your CV →
        </Link>
      </div>
      <ol className="rx-steps">
        <li className="rx-steps__step rx-steps__step--done">
          <span className="rx-steps__node" aria-hidden="true">✓</span>
          <strong>Profile confirmed</strong>
          <span>Tailoring reads from this version.</span>
        </li>
        <li className="rx-steps__step rx-steps__step--next">
          <span className="rx-steps__node" aria-hidden="true">2</span>
          <strong>Point it at a job</strong>
          <span>Paste the posting’s URL and let AI tailor your CV to it.</span>
        </li>
        <li className="rx-steps__step">
          <span className="rx-steps__node" aria-hidden="true">3</span>
          <strong>Review and download</strong>
          <span>Check the rewrite, pick a layout, save the PDF.</span>
        </li>
      </ol>
      <p className="rx-panel__note">
        Nothing is rewritten until you ask. The AI only reorders and rewords what’s already in your
        confirmed profile — it never invents an employer, a date, a degree, or a skill.
      </p>
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

const ORIGIN: Record<string, { label: string; tone: string }> = {
  EXTRACTED: { label: "Read from your CV", tone: "extracted" },
  CORRECTED: { label: "Your corrections", tone: "corrected" },
};

/** Every saved version, newest first, as a vertical timeline. */
export function VersionTimeline({ versions }: { versions: VersionItem[] }) {
  const counts = versions.reduce<Record<string, number>>((acc, v) => {
    acc[v.origin] = (acc[v.origin] ?? 0) + 1;
    return acc;
  }, {});
  return (
    <section className="rx-panel" aria-labelledby="rx-versions-title">
      <div className="rx-panel__head">
        <div>
          <h2 id="rx-versions-title" className="rx-panel__title">
            Version history
          </h2>
          <p className="rx-panel__sub">
            Every correction is a new version; none is ever overwritten — so a CV tailored months ago
            can still be explained by the exact profile that produced it.
          </p>
        </div>
        <ul className="rx-legend" aria-label="Version origins">
          <li className="rx-legend__item rx-legend__item--extracted">Read from CV · {counts.EXTRACTED ?? 0}</li>
          <li className="rx-legend__item rx-legend__item--corrected">Corrections · {counts.CORRECTED ?? 0}</li>
          <li className="rx-legend__item rx-legend__item--manual">
            By hand · {versions.length - (counts.EXTRACTED ?? 0) - (counts.CORRECTED ?? 0)}
          </li>
        </ul>
      </div>

      {/* Scrolls when the history is long, so it must be keyboard-focusable
          (arrow keys scroll it) and needs a name for that focus stop. */}
      <ol className="rx-vtl" tabIndex={0} aria-label="Profile versions, newest first">
        {versions.map((v) => {
          const origin = ORIGIN[v.origin] ?? { label: "Written by hand", tone: "manual" };
          return (
            <li key={v.id} className={`rx-vtl__item rx-vtl__item--${origin.tone}${v.isConfirmed ? " rx-vtl__item--confirmed" : ""}`}>
              <span className="rx-vtl__dot" aria-hidden="true" />
              <div className="rx-vtl__body">
                <span className="rx-vtl__version">v{v.versionNumber}</span>
                <span className="rx-vtl__origin">{origin.label}</span>
                {v.isConfirmed ? <span className="rx-pill rx-pill--ok">Confirmed</span> : null}
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

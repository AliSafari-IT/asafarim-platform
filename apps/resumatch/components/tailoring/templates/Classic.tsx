import type { TailoredResumeContent } from "../../../lib/tailoring/ai/schema";
import { groupSkillsByCategory } from "../../../lib/profile/skillCategories";

/**
 * The one layout this pass ships. Plain, print-first HTML/CSS: no canvas,
 * no PDF-generation dependency — `app/tailor/[id]/preview/page.tsx` renders
 * this inside a `@media print` stylesheet and a "Download PDF" button that
 * just calls `window.print()`. `TailoredResume.templateKey` already exists
 * as a field (see prisma/schema.prisma) so a second layout is additive
 * later, not a schema change.
 */
export const CLASSIC_TEMPLATE_KEY = "classic";

function formatSpan(startedOn: string | null, endedOn: string | null, isCurrent: boolean): string | null {
  const end = isCurrent ? "Present" : endedOn;
  if (!startedOn && !end) return null;
  return [startedOn, end].filter(Boolean).join(" – ");
}

export function ClassicTemplate({ content }: { content: TailoredResumeContent }) {
  return (
    <article className="rm-resume rm-resume--classic">
      <header className="rm-resume__header">
        {content.fullName ? <h1>{content.fullName}</h1> : null}
        {content.headline ? <p className="rm-resume__headline">{content.headline}</p> : null}
        {content.email || content.phone ? (
          <p className="rm-resume__contact">
            {[content.email, content.phone].filter(Boolean).map((item, index, all) => (
              <span key={item}>
                {item}
                {index < all.length - 1 ? <span className="rm-resume__contact-sep" aria-hidden="true" /> : null}
              </span>
            ))}
          </p>
        ) : null}
      </header>

      {content.summary ? (
        <section className="rm-resume__section">
          <h2>Summary</h2>
          <p className="rm-resume__summary">{content.summary}</p>
        </section>
      ) : null}

      {content.skills.length > 0 ? (
        <section className="rm-resume__section">
          <h2>Skills</h2>
          <div className="rm-resume__skill-groups">
            {groupSkillsByCategory(content.skills).map(({ category, skills }) => (
              <p className="rm-resume__skill-group" key={category}>
                <span className="rm-resume__skill-category">{category}:</span>{" "}
                <span className="rm-resume__skill-list">{skills.join(", ")}</span>
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {content.experience.length > 0 ? (
        <section className="rm-resume__section">
          <h2>Experience</h2>
          {content.experience.map((entry, index) => {
            const span = formatSpan(entry.startedOn, entry.endedOn, entry.isCurrent);
            return (
              <div className="rm-resume__entry" key={index}>
                <div className="rm-resume__entry-header">
                  <div className="rm-resume__entry-heading">
                    <strong>{entry.title}</strong>
                    {entry.employer ? <span className="rm-resume__entry-sub">{entry.employer}</span> : null}
                  </div>
                  {span ? <span className="rm-resume__dates">{span}</span> : null}
                </div>
                {entry.bullets.length > 0 ? (
                  <ul>
                    {entry.bullets.map((bullet, bulletIndex) => (
                      <li key={bulletIndex}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {content.education.length > 0 ? (
        <section className="rm-resume__section">
          <h2>Education</h2>
          {content.education.map((entry, index) => (
            <div className="rm-resume__entry" key={index}>
              <div className="rm-resume__entry-header">
                <div className="rm-resume__entry-heading">
                  <strong>{entry.qualification}</strong>
                  {entry.institution ? <span className="rm-resume__entry-sub">{entry.institution}</span> : null}
                </div>
                {entry.completedOn ? <span className="rm-resume__dates">{entry.completedOn}</span> : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {content.certifications.length > 0 ? (
        <section className="rm-resume__section">
          <h2>Certifications</h2>
          {content.certifications.map((entry, index) => (
            <div className="rm-resume__entry" key={index}>
              <div className="rm-resume__entry-header">
                <div className="rm-resume__entry-heading">
                  <strong>{entry.name}</strong>
                  {entry.issuer ? <span className="rm-resume__entry-sub">{entry.issuer}</span> : null}
                </div>
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </article>
  );
}

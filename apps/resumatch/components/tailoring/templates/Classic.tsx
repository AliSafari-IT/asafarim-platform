import type { TailoredResumeContent } from "../../../lib/tailoring/ai/schema";

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
        <p className="rm-resume__contact">
          {[content.email, content.phone].filter(Boolean).join(" · ")}
        </p>
      </header>

      {content.summary ? (
        <section className="rm-resume__section">
          <h2>Summary</h2>
          <p>{content.summary}</p>
        </section>
      ) : null}

      {content.skills.length > 0 ? (
        <section className="rm-resume__section">
          <h2>Skills</h2>
          <p>{content.skills.join(" · ")}</p>
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
                  <strong>{entry.title}</strong>
                  {entry.employer ? <span> · {entry.employer}</span> : null}
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
              <strong>{entry.qualification}</strong>
              {entry.institution ? <span> · {entry.institution}</span> : null}
              {entry.completedOn ? <span className="rm-resume__dates">{entry.completedOn}</span> : null}
            </div>
          ))}
        </section>
      ) : null}

      {content.certifications.length > 0 ? (
        <section className="rm-resume__section">
          <h2>Certifications</h2>
          {content.certifications.map((entry, index) => (
            <div className="rm-resume__entry" key={index}>
              <strong>{entry.name}</strong>
              {entry.issuer ? <span> · {entry.issuer}</span> : null}
            </div>
          ))}
        </section>
      ) : null}
    </article>
  );
}

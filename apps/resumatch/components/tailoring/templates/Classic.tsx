import type { TailoredResumeContent } from "../../../lib/tailoring/ai/schema";
import { groupSkillsByCategory, type SkillCategory } from "../../../lib/profile/skillCategories";
import { formatProfileDate, formatSpan, formatSpokenLanguages, templateLabels } from "../../../lib/tailoring/language";
import { displayUrl, headerLinks, linkText, productLinks } from "../../../lib/profile/links";
import { photoAltText, type CvPhoto } from "../../../lib/profile/photo";

/**
 * The one layout this pass ships. Plain, print-first HTML/CSS: no canvas,
 * no PDF-generation dependency — `app/tailor/[id]/preview/page.tsx` renders
 * this inside a `@media print` stylesheet and a "Download PDF" button that
 * just calls `window.print()`. `TailoredResume.templateKey` already exists
 * as a field (see prisma/schema.prisma) so a second layout is additive
 * later, not a schema change.
 */
export const CLASSIC_TEMPLATE_KEY = "classic";

/**
 * `language` is the CV's stored outputLanguage (#641): headings, skill
 * categories, "Present" and month dates follow it. Null — older CVs, or no
 * language applied — renders exactly as before (English labels, raw dates).
 */
/**
 * `photo` is the candidate's optional CV photo, already resolved against
 * this CV's own show/hide choice by the page. It is never part of
 * `content`: tailoring and the AI never see it.
 */
export function ClassicTemplate({
  content,
  language = null,
  photo = null,
}: {
  content: TailoredResumeContent;
  language?: string | null;
  photo?: CvPhoto | null;
}) {
  const labels = templateLabels(language);
  return (
    // lang marks the CV's own language (#641) so assistive tech reads a
    // Dutch CV as Dutch even when the page around it is in English.
    <article className="rm-resume rm-resume--classic rm-cv" lang={language ?? undefined} data-testid="cv">
      <header className={photo ? "rm-resume__header rm-resume__header--photo" : "rm-resume__header"}>
        {photo ? (
          // A plain <img>: the photo is a private, authenticated route, so
          // next/image's optimiser (which fetches it server-side, without
          // the session) can't serve it. Sized in CSS; the intrinsic size
          // is set so the header doesn't shift while it loads.
          <img
            className={`rm-resume__photo rm-resume__photo--${photo.shape}`}
            src={photo.src}
            alt={photoAltText(content.fullName, labels)}
            width={600}
            height={600}
            decoding="async"
            data-testid="cv-photo"
          />
        ) : null}
        <div className="rm-resume__identity">
          {content.fullName ? <h1>{content.fullName}</h1> : null}
          {content.headline ? <p className="rm-resume__headline">{content.headline}</p> : null}
          <ContactLine
            items={[
              content.email ? { key: "email", text: content.email, href: `mailto:${content.email}` } : null,
              content.phone ? { key: "phone", text: content.phone, href: telHref(content.phone) } : null,
              content.location ? { key: "location", text: content.location } : null,
            ]}
          />
          <ContactLine
            className="rm-resume__links"
            items={headerLinks(content.links).map((link, index) => ({
              key: `link-${index}`,
              text: linkText(link),
              href: link.url,
            }))}
          />
        </div>
      </header>

      {content.summary ? (
        <section className="rm-resume__section">
          <h2>{labels.summary}</h2>
          <p className="rm-resume__summary">{content.summary}</p>
        </section>
      ) : null}

      {content.skills.length > 0 ? (
        <section className="rm-resume__section">
          <h2>{labels.skills}</h2>
          <div className="rm-resume__skill-groups">
            {groupSkillsByCategory(content.skills, undefined, { collapseUnrecognized: true }).map(
              ({ category, skills }) => (
                <p className="rm-resume__skill-group" key={category || "flat"}>
                  {category ? (
                    <span className="rm-resume__skill-category">
                      {labels.skillCategories[category as SkillCategory]}:{" "}
                    </span>
                  ) : null}
                  <span className="rm-resume__skill-list">{skills.join(", ")}</span>
                </p>
              ),
            )}
          </div>
        </section>
      ) : null}

      {content.experience.length > 0 ? (
        <section className="rm-resume__section">
          <h2>{labels.experience}</h2>
          {content.experience.map((entry, index) => {
            const span = formatSpan(entry.startedOn, entry.endedOn, entry.isCurrent, language);
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

      {productLinks(content.links).length > 0 ? (
        <section className="rm-resume__section">
          <h2>{labels.products}</h2>
          <ul className="rm-resume__products">
            {productLinks(content.links).map((link, index) => (
              <li key={index}>
                {link.label ? <strong>{link.label}</strong> : null}
                {link.label ? " — " : null}
                <a href={link.url}>{displayUrl(link.url)}</a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {content.education.length > 0 ? (
        <section className="rm-resume__section">
          <h2>{labels.education}</h2>
          {content.education.map((entry, index) => (
            <div className="rm-resume__entry" key={index}>
              <div className="rm-resume__entry-header">
                <div className="rm-resume__entry-heading">
                  <strong>{entry.qualification}</strong>
                  {entry.institution ? <span className="rm-resume__entry-sub">{entry.institution}</span> : null}
                </div>
                {entry.completedOn ? (
                  <span className="rm-resume__dates">{formatProfileDate(entry.completedOn, language)}</span>
                ) : null}
              </div>
            </div>
          ))}
        </section>
      ) : null}

      {content.certifications.length > 0 ? (
        <section className="rm-resume__section">
          <h2>{labels.certifications}</h2>
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

      {content.languages.length > 0 ? (
        <section className="rm-resume__section">
          <h2>{labels.languages}</h2>
          <p className="rm-resume__languages">
            {formatSpokenLanguages(content.languages, language)}
          </p>
        </section>
      ) : null}
    </article>
  );
}

/** A tel: link only for a plain number ("+32 470 00 00 00", "(02) 123-45-67");
 *  anything else (an extension, a note) stays plain text rather than
 *  becoming a link that dials the wrong number. */
export function telHref(phone: string): string | undefined {
  if (!/^\+?[\d\s().-]{6,}$/.test(phone.trim())) return undefined;
  return `tel:${phone.replace(/[^+\d]/g, "")}`;
}

type ContactItem = { key: string; text: string; href?: string };

/** One centred line of contact items with dot separators. Links stay real
 *  anchors so they are clickable in the printed PDF. */
function ContactLine({ items, className }: { items: (ContactItem | null)[]; className?: string }) {
  const present = items.filter((item): item is ContactItem => item !== null);
  if (present.length === 0) return null;
  return (
    <p className={["rm-resume__contact", className].filter(Boolean).join(" ")}>
      {present.map((item, index) => (
        <span key={item.key}>
          {item.href ? <a href={item.href}>{item.text}</a> : item.text}
          {index < present.length - 1 ? <span className="rm-resume__contact-sep" aria-hidden="true" /> : null}
        </span>
      ))}
    </p>
  );
}

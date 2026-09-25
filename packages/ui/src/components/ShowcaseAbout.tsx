import type { ReactNode, SVGProps } from "react";

export interface ShowcaseAboutFact {
  title: string;
  body: string;
}

/**
 * Structural mirror of `ShowcaseProject` from `@asafarim/auth/apps` — see
 * ShowcaseNotice for why the type is duplicated rather than imported.
 */
export interface ShowcaseAboutContent {
  label: string;
  summary: string;
  aboutTitle: string;
  functional: ShowcaseAboutFact[];
  synthetic: ShowcaseAboutFact[];
  demonstrates: string[];
  operationalStatus: string;
}

/**
 * Every static string ShowcaseAbout renders around the registry-sourced
 * `content`. All optional with English defaults, so existing callers that
 * don't pass `labels` keep rendering exactly as before — an app opts into
 * translation by passing its own `t()`-resolved strings, without this
 * package taking a dependency on any particular i18n system.
 */
export interface ShowcaseAboutLabels {
  sectionWhatWorks?: string;
  sectionSyntheticData?: string;
  /** `{appName}` is substituted in for the app's name if present. */
  sectionDemonstrates?: string;
  sectionWhereThisStands?: string;
  ctaHeading?: string;
  /** `{appName}` is substituted in for the app's name if present. */
  ctaBody?: string;
  ctaLinkText?: string;
}

const DEFAULT_LABELS: Required<ShowcaseAboutLabels> = {
  sectionWhatWorks: "What actually works",
  sectionSyntheticData: "What is demonstration data",
  sectionDemonstrates: "What {appName} demonstrates technically",
  sectionWhereThisStands: "Where this stands",
  ctaHeading: "Need something like this?",
  ctaBody:
    "{appName} is the kind of system ASafariM Digital builds end to end — design, architecture, authentication, data, background processing, testing, and deployment. If you want your own version, or something considerably more advanced, let's talk about it.",
  ctaLinkText: "Discuss a custom solution",
};

function withAppName(template: string, appName: string): string {
  return template.replace("{appName}", appName);
}

/** Small decorative glyphs for the four fixed section headings — purely
 *  visual rhythm, not app data, so they're safe to hardcode per section
 *  regardless of which app renders this component. */
function CheckCircleIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m8.5 12.3 2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FlaskIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M9.5 3.5h5M10 4v5.6L5.8 17a2 2 0 0 0 1.7 3h9a2 2 0 0 0 1.7-3L14 9.6V4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M7.5 14.5h9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function TerminalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <rect x="3" y="4.5" width="18" height="15" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <path d="m7 9.5 3 2.8-3 2.8M12.5 15.5h4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CompassIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="m14.5 9.5-2 5-3-1.5 2-5 3 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
    </svg>
  );
}

function ChevronIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="m9 6 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Zero-padded position, "1" → "01" — a light visual anchor per card so a
 *  reader can scan "three things, four things" without reading every word. */
function pad(n: number): string {
  return String(n + 1).padStart(2, "0");
}

export interface ShowcaseAboutProps {
  /** App name, used in the page's own headings. */
  appName: string;
  content: ShowcaseAboutContent;
  /** Absolute URL of the ASafarIM Digital contact page. */
  contactHref: string;
  /** Translated section/CTA copy — omit for the English defaults. */
  labels?: ShowcaseAboutLabels;
  /** Optional extra content rendered above the call to action. */
  children?: ReactNode;
}

/**
 * The body of an app's "Behind this project" page.
 *
 * Four sections, always in this order: what works, what is demonstration
 * data, what it proves technically, and where it actually stands
 * commercially. The synthetic-data section is not optional — an app that
 * has nothing synthetic to declare should say so explicitly rather than
 * omit the section, because a missing disclosure reads as a claim.
 */
export function ShowcaseAbout({
  appName,
  content,
  contactHref,
  labels,
  children,
}: ShowcaseAboutProps) {
  const l = { ...DEFAULT_LABELS, ...labels };

  return (
    <div className="ui-showcase-about">
      <header className="ui-showcase-about__header">
        <span className="ui-showcase-notice__badge">{content.label}</span>
        <h1 className="ui-showcase-about__title">{content.aboutTitle}</h1>
        <p className="ui-showcase-about__lede">{content.summary}</p>
      </header>

      {/* The whole story in one screenful: every fact as a short chip, no
          paragraphs. The four <details> below hold the full prose for
          anyone who wants it — closed by default so it's opt-in, not the
          first thing a reader has to wade through. */}
      <div className="ui-showcase-about__scorecard">
        {content.functional.map((fact) => (
          <span key={fact.title} className="ui-showcase-about__chip ui-showcase-about__chip--ok">
            <CheckCircleIcon className="ui-showcase-about__chip-icon" />
            {fact.title}
          </span>
        ))}
        {content.synthetic.map((fact) => (
          <span key={fact.title} className="ui-showcase-about__chip ui-showcase-about__chip--warn">
            <FlaskIcon className="ui-showcase-about__chip-icon" />
            {fact.title}
          </span>
        ))}
        {content.demonstrates.map((item) => (
          <span key={item} className="ui-showcase-about__chip ui-showcase-about__chip--info">
            <TerminalIcon className="ui-showcase-about__chip-icon" />
            {item}
          </span>
        ))}
        <span className="ui-showcase-about__chip ui-showcase-about__chip--status">
          <CompassIcon className="ui-showcase-about__chip-icon" />
          {content.operationalStatus}
        </span>
      </div>

      <details className="ui-showcase-about__details">
        <summary className="ui-showcase-about__heading">
          <CheckCircleIcon className="ui-showcase-about__heading-icon" />
          {l.sectionWhatWorks}
          <ChevronIcon className="ui-showcase-about__chevron" />
        </summary>
        <div className="ui-showcase-about__grid">
          {content.functional.map((fact, i) => (
            <article key={fact.title} className="ui-showcase-about__card">
              <span className="ui-showcase-about__card-index">{pad(i)}</span>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </details>

      <details className="ui-showcase-about__details">
        <summary className="ui-showcase-about__heading">
          <FlaskIcon className="ui-showcase-about__heading-icon" />
          {l.sectionSyntheticData}
          <ChevronIcon className="ui-showcase-about__chevron" />
        </summary>
        <div className="ui-showcase-about__grid">
          {content.synthetic.map((fact, i) => (
            <article
              key={fact.title}
              className="ui-showcase-about__card ui-showcase-about__card--synthetic"
            >
              <span className="ui-showcase-about__card-index">{pad(i)}</span>
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </details>

      <details className="ui-showcase-about__details">
        <summary className="ui-showcase-about__heading">
          <TerminalIcon className="ui-showcase-about__heading-icon" />
          {withAppName(l.sectionDemonstrates, appName)}
          <ChevronIcon className="ui-showcase-about__chevron" />
        </summary>
        <ul className="ui-showcase-about__demonstrates">
          {content.demonstrates.map((item) => (
            <li key={item} className="ui-showcase-about__demonstrates-item">
              <CheckCircleIcon className="ui-showcase-about__demonstrates-icon" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      </details>

      <details className="ui-showcase-about__details">
        <summary className="ui-showcase-about__heading">
          <CompassIcon className="ui-showcase-about__heading-icon" />
          {l.sectionWhereThisStands}
          <ChevronIcon className="ui-showcase-about__chevron" />
        </summary>
        <p className="ui-showcase-about__status">{content.operationalStatus}</p>
      </details>

      {children}

      <section className="ui-showcase-about__cta">
        <h2>{l.ctaHeading}</h2>
        <p>{withAppName(l.ctaBody, appName)}</p>
        <a className="ui-showcase-about__cta-link" href={contactHref}>
          {l.ctaLinkText}
        </a>
      </section>
    </div>
  );
}

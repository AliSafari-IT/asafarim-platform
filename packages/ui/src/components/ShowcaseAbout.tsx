import type { ReactNode } from "react";

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
    "{appName} is the kind of system ASafarIM Digital builds end to end — design, architecture, authentication, data, background processing, testing, and deployment. If you want your own version, or something considerably more advanced, let's talk about it.",
  ctaLinkText: "Discuss a custom solution",
};

function withAppName(template: string, appName: string): string {
  return template.replace("{appName}", appName);
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

      <section className="ui-showcase-about__section">
        <h2 className="ui-showcase-about__heading">{l.sectionWhatWorks}</h2>
        <div className="ui-showcase-about__grid">
          {content.functional.map((fact) => (
            <article key={fact.title} className="ui-showcase-about__card">
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ui-showcase-about__section">
        <h2 className="ui-showcase-about__heading">
          {l.sectionSyntheticData}
        </h2>
        <div className="ui-showcase-about__grid">
          {content.synthetic.map((fact) => (
            <article
              key={fact.title}
              className="ui-showcase-about__card ui-showcase-about__card--synthetic"
            >
              <h3>{fact.title}</h3>
              <p>{fact.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="ui-showcase-about__section">
        <h2 className="ui-showcase-about__heading">
          {withAppName(l.sectionDemonstrates, appName)}
        </h2>
        <ul className="ui-showcase-about__list">
          {content.demonstrates.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="ui-showcase-about__section">
        <h2 className="ui-showcase-about__heading">{l.sectionWhereThisStands}</h2>
        <p className="ui-showcase-about__status">{content.operationalStatus}</p>
      </section>

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

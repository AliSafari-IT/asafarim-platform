import type { ReactNode } from "react";

/**
 * The in-app page header, in the landing page's visual language: a pill
 * kicker, a large headline with one accented phrase, a lead paragraph, and
 * a slot on the right for a data visual (usually the JourneyTracker).
 */
export function PageHero({
  kicker,
  title,
  accent,
  lead,
  aside,
}: {
  kicker: string;
  /** Headline text; `accent` (if given) is rendered after it, highlighted. */
  title: string;
  accent?: string;
  lead?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section className="rx-hero">
      <div className="rx-hero__copy">
        <span className="rx-kicker">{kicker}</span>
        <h1 className="rx-hero__title">
          {title}
          {accent ? (
            <>
              {" "}
              <span className="rx-hero__accent">{accent}</span>
            </>
          ) : null}
        </h1>
        {lead ? <p className="rx-hero__lead">{lead}</p> : null}
      </div>
      {aside ? <div className="rx-hero__aside">{aside}</div> : null}
    </section>
  );
}

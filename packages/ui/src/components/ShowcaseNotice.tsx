import type { ReactNode } from "react";

/**
 * Structural mirror of `ShowcaseProject` from `@asafarim/auth/apps`. Declared
 * here rather than imported for the same reason as `AppSwitcherSource` in
 * links.ts — importing @asafarim/auth would drag next-auth, Prisma, and
 * bcryptjs behind every design-system import.
 */
export interface ShowcaseNoticeContent {
  label: string;
  summary: string;
  aboutLabel: string;
  aboutHref: string;
}

export interface ShowcaseNoticeProps {
  /** Registry-sourced copy — pass `getShowcaseProject(key)` straight in. */
  content: ShowcaseNoticeContent;
  /**
   * Renders the "about this project" link. Apps pass their router's Link so
   * navigation stays client-side; omitting it falls back to a plain anchor.
   */
  renderLink?: (props: { href: string; children: ReactNode }) => ReactNode;
  /** Optional variant: "inline" (default) or "compact" for dense heroes. */
  variant?: "inline" | "compact";
  className?: string;
}

/**
 * Honest positioning for a public product app: a small badge, one paragraph
 * of app-specific truth, and a link to the fuller explanation.
 *
 * Deliberately understated — this builds trust, so it must not read as a
 * legal warning or as an apology for the software. Copy always comes from
 * the platform registry; this component never invents claims of its own.
 */
export function ShowcaseNotice({
  content,
  renderLink,
  variant = "inline",
  className,
}: ShowcaseNoticeProps) {
  const link = renderLink
    ? renderLink({ href: content.aboutHref, children: content.aboutLabel })
    : (
        <a className="ui-showcase-notice__link" href={content.aboutHref}>
          {content.aboutLabel}
        </a>
      );

  return (
    <aside
      className={`ui-showcase-notice ui-showcase-notice--${variant}${
        className ? ` ${className}` : ""
      }`}
      aria-label="About this showcase project"
    >
      <span className="ui-showcase-notice__badge">{content.label}</span>
      <p className="ui-showcase-notice__body">
        {content.summary}{" "}
        <span className="ui-showcase-notice__link-wrap">{link}</span>
      </p>
    </aside>
  );
}
